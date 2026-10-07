"""Build through the cloud proxy without disabling TLS or persisting its CA."""
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
command = ["docker", "build", "--network=host"]
hosts = set()
for name in ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]:
    if os.environ.get(name):
        command.extend(["--build-arg", name])
        if name != "NO_PROXY":
            hosts.add(urlsplit(os.environ[name]).hostname)
for host in sorted(hosts):
    command.extend(["--add-host", f"{host}:{socket.gethostbyname(host)}"])
ca = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE")
if hosts:
    ca = ca or ssl.get_default_verify_paths().cafile
    if not ca or not Path(ca).is_file():
        raise SystemExit("Falta el certificado de confianza del proxy; no se desactivará TLS.")
    command.extend(["--secret", f"id=proxy_ca,src={ca}"])
command.extend(["-t", "camer-animales:local", "."])
build_environment = os.environ.copy()
build_environment.setdefault("DOCKER_CONFIG", str(Path(tempfile.gettempdir()) / "camer-docker"))
raise SystemExit(subprocess.call(command, cwd=root, env=build_environment))
