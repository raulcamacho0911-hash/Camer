"""YOLOv5 v7.0 COCO inference using its official ONNX export."""
from pathlib import Path
import hashlib
import json

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parent
ANIMALS = {
    14: "Ave", 15: "Gato", 16: "Perro", 17: "Caballo", 18: "Oveja",
    19: "Vaca", 20: "Elefante", 21: "Oso", 22: "Cebra", 23: "Jirafa",
}


def nms(boxes, scores, threshold=0.45):
    order = scores.argsort()[::-1]
    selected = []
    while order.size:
        current = order[0]
        selected.append(int(current))
        rest = order[1:]
        if not rest.size:
            break
        low = np.maximum(boxes[current, :2], boxes[rest, :2])
        high = np.minimum(boxes[current, 2:], boxes[rest, 2:])
        intersect = np.prod(np.maximum(high - low, 0), axis=1)
        area = np.prod(np.maximum(boxes[rest, 2:] - boxes[rest, :2], 0), axis=1)
        current_area = np.prod(np.maximum(boxes[current, 2:] - boxes[current, :2], 0))
        iou = intersect / np.maximum(area + current_area - intersect, 1e-9)
        order = rest[iou <= threshold]
    return selected


class AnimalDetector:
    def __init__(self):
        model = ROOT / "models/yolov5s.onnx"
        manifest = json.loads((ROOT / "models/manifest.json").read_text())
        if hashlib.sha256(model.read_bytes()).hexdigest() != manifest["onnx_sha256"]:
            raise RuntimeError("El modelo no coincide con su huella de integridad.")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.session.run(None, {self.input_name: np.zeros((1, 3, 640, 640), dtype=np.float32)})

    def detect(self, image: Image.Image, confidence=0.35):
        width, height = image.size
        scale = min(640 / width, 640 / height)
        resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.BILINEAR)
        pad_x = (640 - resized.width) // 2
        pad_y = (640 - resized.height) // 2
        canvas = Image.new("RGB", (640, 640), (114, 114, 114))
        canvas.paste(resized, (pad_x, pad_y))
        tensor = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        predictions = self.session.run(None, {self.input_name: tensor})[0][0]
        class_ids = predictions[:, 5:].argmax(axis=1)
        scores = predictions[:, 4] * predictions[np.arange(len(predictions)), class_ids + 5]
        keep = (scores >= confidence) & np.isin(class_ids, list(ANIMALS))
        predictions, scores, class_ids = predictions[keep], scores[keep], class_ids[keep]
        boxes = np.concatenate((predictions[:, :2] - predictions[:, 2:4] / 2,
                                predictions[:, :2] + predictions[:, 2:4] / 2), axis=1)
        boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad_x) / scale
        boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad_y) / scale
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, width)
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, height)
        result = []
        for class_id in np.unique(class_ids):
            group = np.flatnonzero(class_ids == class_id)
            for local_index in nms(boxes[group], scores[group]):
                index = group[local_index]
                result.append({"label": ANIMALS[int(class_id)], "class_id": int(class_id),
                               "confidence": round(float(scores[index]), 4),
                               "box": [round(float(v), 1) for v in boxes[index]]})
        return sorted(result, key=lambda d: d["confidence"], reverse=True)[:100]
