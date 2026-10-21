"""फोटोवरून संभाव्य रोगाचा अंदाज देतो."""
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "pomegranate_model.keras"
CLASS_PATH = MODEL_DIR / "class_names.json"

IMAGE_SIZE = (224, 224)

# या दोन किमतींना test_report.json आणि खऱ्या शेतातील फोटोंनुसार ठरवा.
MIN_CONFIDENCE = 0.70   # यापेक्षा कमी असल्यास "निश्चित नाही"
MIN_MARGIN = 0.20       # पहिल्या आणि दुसऱ्या अंदाजातला फरक यापेक्षा कमी असल्यास "निश्चित नाही"

# Django चालू असताना मॉडेल प्रत्येक वेळी पुन्हा load होऊ नये.
_model = None
_class_names = None


def load_model_once():
    global _model, _class_names
    if _model is None:
        if not MODEL_PATH.exists() or not CLASS_PATH.exists():
            raise FileNotFoundError("Trained model सापडलं नाही. आधी train.py चालवा.")
        _model = tf.keras.models.load_model(MODEL_PATH)
        with open(CLASS_PATH, "r", encoding="utf-8") as f:
            _class_names = json.load(f)
    return _model, _class_names


def predict_disease(image_source):
    """image_source: फाइलचा path किंवा open केलेली फाइल (उदा. Django upload)."""
    model, class_names = load_model_once()

    with Image.open(image_source) as img:
        img = img.convert("RGB").resize(IMAGE_SIZE)
        array = np.asarray(img, dtype=np.float32)

    # मॉडेलच्या आतच 0-255 -> -1..1 preprocessing आहे, म्हणून इथे कच्चा फोटो द्या.
    probs = model.predict(np.expand_dims(array, axis=0), verbose=0)[0]

    order = np.argsort(probs)[::-1]
    top = int(order[0])
    second = int(order[1]) if len(order) > 1 else None
    confidence = float(probs[top])
    margin = confidence - float(probs[second]) if second is not None else confidence

    uncertain = confidence < MIN_CONFIDENCE or margin < MIN_MARGIN

    return {
        "label": class_names[top],
        "confidence": round(confidence, 4),
        "uncertain": uncertain,
        "scores": {name: round(float(p), 4) for name, p in zip(class_names, probs)},
    }
