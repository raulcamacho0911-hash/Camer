"""Publish only application files; never upload credentials or local environment files."""
import argparse
import json
import os
from pathlib import Path
import time

import requests
from huggingface_hub import HfApi
from huggingface_hub.errors import RepositoryNotFoundError


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="camer-animales")
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()
    folder = Path(__file__).resolve().parents[1] / "dist"
    if not (folder / "index.html").is_file():
        raise SystemExit("Falta la versión estática. Ejecuta npm ci y npm run build antes de publicar.")
    manifest = json.loads((folder / "models/manifest.json").read_text())
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("Falta HF_TOKEN. Añádelo en los ajustes seguros del entorno; no lo pegues en el chat.")
    api = HfApi(token=token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{args.name}"
    try:
        existing = api.repo_info(repo_id, repo_type="space")
        if not args.update:
            raise SystemExit(f"{repo_id} ya existe. Elige otro --name o usa --update para actualizar tu aplicación de Camer.")
        title = getattr(getattr(existing, "card_data", None), "title", None)
        if existing.sdk != "static" or title != "Camer · Animales":
            raise SystemExit("El Space existente no es la versión estática de Camer. Se conservó sin cambios; elige otro --name.")
    except RepositoryNotFoundError:
        api.create_repo(repo_id, repo_type="space", space_sdk="static", private=False)
    result = api.upload_folder(
        repo_id=repo_id, repo_type="space", folder_path=str(folder),
        allow_patterns=["README.md", "LICENSE", "index.html", "app.js", "worker.js",
                        "styles.css", "icon.svg", "models/*", "vendor/*"],
        commit_message="Publicar Camer: detección de animales con YOLOv5",
    )
    info = api.space_info(repo_id)
    print("Archivos publicados:", result.commit_url, flush=True)
    print("Space:", f"https://huggingface.co/spaces/{repo_id}", flush=True)
    host = getattr(info, "host", None)
    if not host and getattr(info, "subdomain", None):
        host = f"https://{info.subdomain}.hf.space"
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        info = api.space_info(repo_id)
        host = getattr(info, "host", None) or host
        if not host and getattr(info, "subdomain", None):
            host = f"https://{info.subdomain}.hf.space"
        stage = str(info.runtime.stage) if info.runtime else "desconocido"
        print("Estado:", stage, flush=True)
        if "ERROR" in stage:
            raise SystemExit("Hugging Face informó un fallo de construcción o ejecución. Revisa sus logs.")
        if host:
            url = host if host.startswith("https://") else f"https://{host}"
            try:
                response = requests.get(url.rstrip("/") + "/", timeout=20)
                public_manifest = requests.get(url.rstrip("/") + "/models/manifest.json", timeout=20)
                if (response.ok and 'id="analyze-button"' in response.text and public_manifest.ok
                        and public_manifest.json().get("onnx_sha256") == manifest["onnx_sha256"]):
                    print("Aplicación pública verificada:", url, flush=True)
                    output_file = os.environ.get("GITHUB_OUTPUT")
                    if output_file:
                        with open(output_file, "a") as output:
                            output.write(f"app_url={url.rstrip('/')}\n")
                    return
            except (requests.RequestException, ValueError):
                pass
        time.sleep(15)
    raise SystemExit("Los archivos se subieron, pero no se confirmó la web estática en 10 minutos. Revisa el estado del Space.")


if __name__ == "__main__":
    main()
