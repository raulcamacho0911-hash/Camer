---
title: Camer · Animales
emoji: 🐾
colorFrom: green
colorTo: yellow
sdk: static
app_file: dist/index.html
app_build_command: npm ci && npm run build
license: gpl-3.0
short_description: Detecta animales en tus fotos con YOLOv5 desde el celular.
---

# Camer

Aplicación web en español para detectar animales en fotos tomadas desde el celular o cargadas desde la galería. Usa **YOLOv5s v7.0 preentrenado en COCO** con ONNX Runtime Web. Identifica diez categorías: ave, gato, perro, caballo, oveja, vaca, elefante, oso, cebra y jirafa.

La versión publicada es un **Static Space gratuito de Hugging Face**, sin servidor de inferencia. La plataforma informó que Docker y Gradio con CPU básica requieren PRO; Static Spaces siguen gratuitos según su [documentación oficial](https://huggingface.co/docs/hub/spaces-sdks-static).

Las fotos se procesan en el navegador, en un Web Worker, y **no se suben al servidor**. La primera detección descarga unos 40 MB del modelo y su motor. El modelo permanece en memoria durante esa sesión y el navegador puede reutilizar su caché HTTP en visitas posteriores. Se necesita un navegador actualizado y memoria disponible; la velocidad depende del celular. No requiere GPU, claves de IA ni entrenamiento para estas categorías.

Ofrece captura de fotos, carga de imágenes, confianza ajustable, cajas, resultados y descarga de la imagen anotada. No ofrece video en tiempo real ni reconoce razas o especies concretas. Para otros animales se necesitaría un dataset etiquetado y transfer learning.

## Publicar desde GitHub

1. Abre [los secretos de Actions](https://github.com/raulcamacho0911-hash/Camer/settings/secrets/actions/new).
2. En **Name**, escribe `HF_TOKEN`. En **Secret**, pega un token de Hugging Face con permiso **Write** y pulsa **Add secret**. Revoca cualquier token expuesto antes de crear otro. Nunca lo publiques en archivos, capturas ni chats.
3. Abre [Publicar Camer](https://github.com/raulcamacho0911-hash/Camer/actions/workflows/publicar.yml), pulsa **Run workflow**, selecciona `main` y confirma **Run workflow**. Para la primera publicación deja desmarcada la opción de actualizar un Space existente.
4. La acción construye la web, prueba una foto real en Chromium, crea un Space **static** público y sube exclusivamente los archivos de `dist/`. Después verifica el sitio alojado y repite la detección desde su URL pública.
5. Cuando la ejecución termine correctamente, su resumen muestra el enlace para abrir desde Chrome o Safari en tu celular.

El token autentica la publicación desde GitHub Actions; no se incluye en la web ni se necesita para usarla. Si ya existe tu Space de Camer, marca **actualizar** solo cuando quieras actualizarlo.

## Desarrollo y pruebas

```sh
cd /workspace/Camer
npm ci --cache /workspace/.cache/camer-npm --no-audit --no-fund
npm run build
python3 -m http.server 7860 --bind 0.0.0.0 --directory dist
```

`dist/` incluye HTML, CSS, JavaScript, modelo y motor WebAssembly, sin depender de una CDN externa para ONNX Runtime. La construcción verifica el SHA-256 del modelo y el navegador lo verifica otra vez antes de ejecutar inferencia.

```sh
npm run test:browser
# Si no existe Chromium, instálalo primero:
npx playwright install --with-deps chromium
```

La prueba descarga por HTTPS una foto real de perro del repositorio PyTorch Hub y comprueba detección, confianza, descarga, umbral, imagen vacía, imagen dañada, ausencia de errores y ausencia de envíos de fotos. Puedes usar una foto propia con `CAMER_TEST_DOG_IMAGE=/ruta/perro.jpg`. Para probar el despliegue usa `CAMER_APP_URL=https://tu-space.hf.space npm run test:browser`.

Para publicar desde Codex, guarda `HF_TOKEN` de forma segura, permite el acceso a Hugging Face y ejecuta `.venv/bin/python scripts/publish_space.py` después de construir `dist/`. GitHub Actions utiliza el secreto del repositorio y no depende de los ajustes de red de Codex.

Se admiten JPG, PNG o WebP de hasta 12 MB y 24 megapíxeles. HEIC necesita conversión. La cámara requiere HTTPS y soporte del navegador; en escritorio el selector puede comportarse de otra manera. Usa fotos nítidas con buena luz. La detección puede equivocarse y no debe usarse para decisiones críticas sobre fauna.

## Backend opcional para desarrollo local

El backend Python original se conserva como alternativa local. Procesa las fotos en el servidor y no se publica con el flujo Static Space.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app:app --host 0.0.0.0 --port 7860
CAMER_TEST_DOG_IMAGE=/ruta/perro.jpg .venv/bin/python -m pytest -q
```

`GET /health` comprueba la carga del modelo; `POST /api/detect` recibe multipart con `file` y `confidence` (0.10–0.90). El Dockerfile sigue disponible para alojamiento con cómputo. `.venv/bin/python scripts/build_local.py` permite construirlo usando el proxy y su certificado de confianza, sin desactivar TLS.

## Modelo y licencia

Modelo oficial de [Ultralytics YOLOv5 v7.0](https://github.com/ultralytics/yolov5/tree/v7.0), commit `915bbf294bb74c859f0b41f1c23bc395014ea679`. Exportación FP32, opset 12, RGB NCHW 640×640 y salida `[1,25200,85]`. Se aplica letterboxing, confianza `objectness × class_probability`, filtrado de animales y NMS por clase. La interpolación de Canvas puede producir pequeñas diferencias respecto a Pillow en el backend.

`models/manifest.json` registra las huellas del modelo y de los pesos fuente. Para reproducir la exportación usa ese commit, Python 3.12, PyTorch 2.5.1 CPU, torchvision 0.20.1 y ONNX 1.17.0. Descarga los pesos desde el enlace del manifest conservando TLS y verifica su SHA-256 antes de cargar. Ejecuta `python export.py --weights yolov5s.pt --include onnx --opset 12 --imgsz 640 640 --device cpu`.

Código y modelo: GPL-3.0, con la licencia de YOLOv5 incluida. ONNX Runtime: MIT, con su licencia incluida en la web publicada. Consulta también las condiciones de Ultralytics y COCO para usos comerciales.
