import asyncio
import base64
import io
import time
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from detector import ANIMALS, AnimalDetector

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 12 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000


@asynccontextmanager
async def lifespan(app):
    app.state.detector = AnimalDetector()
    app.state.inference_lock = asyncio.Semaphore(1)
    yield


app = FastAPI(title="Camer · Detección de animales", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def home():
    return FileResponse(ROOT / "static/index.html")


@app.get("/health")
def health():
    return {"status": "ok", "model": "YOLOv5s v7.0 COCO", "animals": list(ANIMALS.values())}


def analyze(data, confidence):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(415, "Usa una imagen JPG, PNG o WebP. Si tu foto es HEIC, conviértela a JPG.")
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, "No pudimos leer la imagen. Usa una foto JPG, PNG o WebP de hasta 24 megapíxeles.")
    start = time.perf_counter()
    detections = app.state.detector.detect(image, confidence)
    elapsed = round((time.perf_counter() - start) * 1000)
    draw = ImageDraw.Draw(image)
    font_size = max(18, image.width // 32)
    font = ImageFont.load_default(size=font_size)
    for detection in detections:
        box = detection["box"]
        draw.rectangle(box, outline="#a3e635", width=max(3, image.width // 300))
        text = f'{detection["label"]} {detection["confidence"]:.0%}'
        x, y = box[:2]
        label_position = (x + 5, max(0, y - font_size - 10))
        bounds = draw.textbbox(label_position, text, font=font)
        draw.rectangle((bounds[0] - 4, bounds[1] - 3, bounds[2] + 4, bounds[3] + 3), fill="#a3e635")
        draw.text(label_position, text, fill="#14251c", font=font)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=88)
    return {"detections": detections, "elapsed_ms": elapsed,
            "image": "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode(),
            "width": image.width, "height": image.height}


@app.post("/api/detect")
async def detect(file: UploadFile = File(...), confidence: float = Form(0.35, ge=0.1, le=0.9)):
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "La foto supera 12 MB. Elige una imagen más pequeña.")
    if not data:
        raise HTTPException(400, "Selecciona una foto antes de analizar.")
    async with app.state.inference_lock:
        return await run_in_threadpool(analyze, data, confidence)
