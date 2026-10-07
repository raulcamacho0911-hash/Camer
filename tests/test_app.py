import io
import os
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import app
from detector import nms


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as client:
        yield client


def blank_photo():
    output = io.BytesIO()
    Image.new("RGB", (800, 400), "white").save(output, format="JPEG")
    return output.getvalue()


def test_health_and_ui(client):
    assert client.get("/health").json()["model"] == "YOLOv5s v7.0 COCO"
    assert len(client.get("/health").json()["animals"]) == 10
    assert 'capture="environment"' in client.get("/").text
    assert client.get("/static/app.js").status_code == 200


def test_blank_has_no_animals(client):
    response = client.post("/api/detect", files={"file": ("blank.jpg", blank_photo(), "image/jpeg")})
    assert response.status_code == 200
    result = response.json()
    assert result["detections"] == []
    assert result["width"] == 800 and result["height"] == 400
    assert result["image"].startswith("data:image/jpeg;base64,")


def test_invalid_image(client):
    assert client.post("/api/detect", files={"file": ("bad.jpg", b"not an image")}).status_code == 400


def test_oversize(client):
    assert client.post("/api/detect", files={"file": ("big.jpg", b"x" * (12 * 1024 * 1024 + 1))}).status_code == 413


@pytest.mark.parametrize("confidence", ["0.01", "0.95", "nan"])
def test_invalid_confidence(client, confidence):
    assert client.post("/api/detect", files={"file": ("blank.jpg", blank_photo())}, data={"confidence": confidence}).status_code == 422


def test_nms_suppresses_duplicate_not_separate_animal():
    boxes = np.array([[0, 0, 100, 100], [5, 5, 100, 100], [200, 200, 300, 300]])
    assert nms(boxes, np.array([0.9, 0.8, 0.7])) == [0, 2]


def test_real_dog_photo(client):
    path = os.environ.get("CAMER_TEST_DOG_IMAGE")
    if not path:
        pytest.skip("Proporciona CAMER_TEST_DOG_IMAGE para verificar una foto real.")
    response = client.post("/api/detect", files={"file": ("dog.jpg", Path(path).read_bytes(), "image/jpeg")})
    assert response.status_code == 200
    dogs = [d for d in response.json()["detections"] if d["label"] == "Perro"]
    assert dogs and dogs[0]["confidence"] > 0.5
    width, height = response.json()["width"], response.json()["height"]
    x1, y1, x2, y2 = dogs[0]["box"]
    assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
