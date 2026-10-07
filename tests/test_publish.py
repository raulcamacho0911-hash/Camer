import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from huggingface_hub.errors import RepositoryNotFoundError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("publish_space", ROOT / "scripts/publish_space.py")
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)


@pytest.fixture
def api(monkeypatch, tmp_path):
    api = Mock()
    api.whoami.return_value = {"name": "test-user"}
    api.repo_info.side_effect = RepositoryNotFoundError("Space absent")
    api.upload_folder.return_value = SimpleNamespace(commit_url="https://huggingface.co/spaces/test-user/camer-animales/commit/test")
    api.space_info.return_value = SimpleNamespace(host=None, subdomain="test-user-camer-animales", runtime=SimpleNamespace(stage="RUNNING"))
    monkeypatch.setattr(publish, "HfApi", lambda **kwargs: api)
    monkeypatch.setenv("HF_TOKEN", "test-placeholder-not-a-credential")
    monkeypatch.setenv("GITHUB_OUTPUT", str(tmp_path / "output"))
    monkeypatch.setattr("sys.argv", ["publish_space.py"])
    sha = json.loads((ROOT / "dist/models/manifest.json").read_text())["onnx_sha256"]
    responses = [SimpleNamespace(ok=True, text='<button id="analyze-button">'),
                 SimpleNamespace(ok=True, json=lambda: {"onnx_sha256": sha})]
    monkeypatch.setattr(publish.requests, "get", Mock(side_effect=responses))
    return api


def test_creates_free_static_space_and_uploads_only_built_files(api, tmp_path):
    publish.main()
    api.create_repo.assert_called_once_with("test-user/camer-animales", repo_type="space", space_sdk="static", private=False)
    assert Path(api.upload_folder.call_args.kwargs["folder_path"]).name == "dist"
    patterns = api.upload_folder.call_args.kwargs["allow_patterns"]
    assert "index.html" in patterns and "vendor/*" in patterns
    assert "Dockerfile" not in patterns and "app.py" not in patterns
    assert (tmp_path / "output").read_text() == "app_url=https://test-user-camer-animales.hf.space\n"


def test_preserves_an_unrelated_existing_space(api, monkeypatch):
    api.repo_info.side_effect = None
    api.repo_info.return_value = SimpleNamespace(sdk="static", card_data=SimpleNamespace(title="Other project"))
    monkeypatch.setattr("sys.argv", ["publish_space.py", "--update"])
    with pytest.raises(SystemExit, match="conservó sin cambios"):
        publish.main()
    api.create_repo.assert_not_called()
    api.upload_folder.assert_not_called()


def test_running_stage_alone_does_not_establish_public_readiness(api, monkeypatch, tmp_path):
    monkeypatch.setattr(publish.requests, "get", Mock(return_value=SimpleNamespace(ok=False, text="Not ready")))
    monkeypatch.setattr(publish.time, "monotonic", Mock(side_effect=[0, 0, 601]))
    monkeypatch.setattr(publish.time, "sleep", Mock())
    with pytest.raises(SystemExit, match="no se confirmó"):
        publish.main()
    assert not (tmp_path / "output").exists()
