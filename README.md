---
title: Camer · Animales
emoji: 🐾
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
license: gpl-3.0
short_description: Detecta animales en tus fotos con YOLOv5 desde el celular.
---

# Camer

Aplicación web en español para detectar animales en fotos tomadas desde el celular o cargadas desde la galería. Usa **YOLOv5s v7.0 preentrenado en COCO**, exportado a ONNX. No necesita Kaggle, GPU, una clave de IA ni entrenamiento para estas diez categorías: ave, gato, perro, caballo, oveja, vaca, elefante, oso, cebra y jirafa.

Permite ajustar la confianza mínima, ver cajas y resultados, y descargar la imagen anotada. Es detección por fotografía; no ofrece video en tiempo real ni reconoce razas o especies particulares. Para animales fuera de COCO se necesitaría un dataset etiquetado y transfer learning.

## Desarrollo

```sh
cd /workspace/Camer
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app:app --host 0.0.0.0 --port 7860
```

`GET /health` comprueba que el modelo cargó y ejecutó una inferencia de calentamiento. `POST /api/detect` acepta multipart con `file` y `confidence` (0.10–0.90) y devuelve cajas, etiquetas, confianza, tiempo de inferencia e imagen anotada.

```sh
.venv/bin/python -m pytest -q
# Comprobación adicional con una foto real de perro proporcionada por ti:
CAMER_TEST_DOG_IMAGE=/ruta/perro.jpg .venv/bin/python -m pytest -q
```

Las fotos aceptadas son JPG, PNG o WebP, hasta 12 MB y 24 megapíxeles. Se procesan en memoria; no se conservan después del análisis. HEIC requiere conversión. En el celular, abre la dirección pública HTTPS del Space; «Tomar foto» solicita la cámara del dispositivo cuando su navegador lo soporta. En escritorio puede abrir un selector de archivo. El Space gratuito puede dormir y tardar en iniciar. No debe usarse para tomar decisiones críticas sobre fauna.

## Publicar en Hugging Face Spaces

1. Guarda `HF_TOKEN` en la configuración segura del entorno (token de Hugging Face con permiso para crear y escribir Spaces). No lo escribas en el código ni en el chat.
2. Permite `huggingface.co` y `*.hf.space` en la red del entorno.
3. Ejecuta:

```sh
.venv/bin/python scripts/publish_space.py
```

El script obtiene el usuario autenticado, crea un Space Docker público llamado `camer-animales` y sube los archivos de la aplicación. Si el nombre existe, se detiene para preservar su contenido; especifica otro nombre con `--name` o usa `--update` únicamente para actualizar tu Space de Camer. Después espera hasta que `/health` responda. El script no inventa una URL como prueba de publicación: imprime el enlace confirmado por Hugging Face y el estado observado.

También se puede crear manualmente un Space público, elegir **Docker**, y subir este proyecto incluyendo `models/yolov5s.onnx`. El Dockerfile instala solo las dependencias de ejecución, usa un usuario sin privilegios y escucha en el puerto 7860.

## Modelo y licencia

El modelo incluido proviene de los pesos oficiales de [Ultralytics YOLOv5 v7.0](https://github.com/ultralytics/yolov5/tree/v7.0), commit `915bbf294bb74c859f0b41f1c23bc395014ea679`. Su exportación es FP32, opset 12, entrada RGB NCHW 640×640 y salida `[1,25200,85]`. Se aplican letterboxing, confianza `objectness × class_probability`, filtrado de animales y NMS por clase. `models/manifest.json` registra las huellas SHA-256 del modelo y de los pesos fuente. La huella del modelo se verifica al iniciar.

Para reproducir la exportación, usa el código oficial de ese commit, Python 3.12, PyTorch 2.5.1 CPU, torchvision 0.20.1 y ONNX 1.17.0; descarga los pesos desde el enlace del manifest conservando TLS y verifica su SHA-256 antes de cargar. Ejecuta `python export.py --weights yolov5s.pt --include onnx --opset 12 --imgsz 640 640 --device cpu`. El runtime de Camer no deserializa archivos PyTorch ni descarga pesos al iniciar.

Código y modelo distribuidos bajo GPL-3.0, con la licencia de YOLOv5 incluida. Los pesos y el dataset de origen tienen sus propias condiciones; consulta Ultralytics y COCO para usos comerciales.
