"""Publish only application files; never upload credentials or local environment files."""
import argparse
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
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("Falta HF_TOKEN. Añádelo en los ajustes seguros del entorno; no lo pegues en el chat.")
    api = HfApi(token=token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{args.name}"
    try:
        api.repo_info(repo_id, repo_type="space")
        if not args.update:
            raise SystemExit(f"{repo_id} ya existe. Elige otro --name o usa --update para actualizar tu aplicación de Camer.")
    except RepositoryNotFoundError:
        api.create_repo(repo_id, repo_type="space", space_sdk="docker", private=False)
    result = api.upload_folder(
        repo_id=repo_id, repo_type="space", folder_path=str(Path(__file__).resolve().parents[1]),
        allow_patterns=["README.md", "LICENSE", "Dockerfile", ".dockerignore", "requirements.txt",
                        "app.py", "detector.py", "static/*", "models/*"],
        commit_message="Publicar Camer: detección de animales con YOLOv5",
    )
    info = api.space_info(repo_id)
    print("Archivos publicados:", result.commit_url, flush=True)
    print("Space:", f"https://huggingface.co/spaces/{repo_id}", flush=True)
    host = getattr(info, "host", None)
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        info = api.space_info(repo_id)
        host = getattr(info, "host", None) or host
        stage = str(info.runtime.stage) if info.runtime else "desconocido"
        print("Estado:", stage, flush=True)
        if "ERROR" in stage:
            raise SystemExit("Hugging Face informó un fallo de construcción o ejecución. Revisa sus logs.")
        if host:
            url = host if host.startswith("https://") else f"https://{host}"
            try:
                response = requests.get(url.rstrip("/") + "/health", timeout=20)
                if response.ok and response.json().get("status") == "ok":
                    print("Aplicación pública verificada:", url, flush=True)
                    return
            except (requests.RequestException, ValueError):
                pass
        time.sleep(15)
    raise SystemExit("Los archivos se subieron, pero no se confirmó el arranque en 10 minutos. Revisa el estado del Space.")


if __name__ == "__main__":
    main()
