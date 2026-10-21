"""
डाळिंब रोग ओळख मॉडेल train करतो (MobileNetV2 + Transfer Learning).

आधी split_dataset.py चालवलेला असावा (data_split/train, val, test).
चालवा:  python -m plant_disease.train
"""
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data_split"
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 16
SEED = 42
HEAD_EPOCHS = 12      # टप्पा 1: फक्त वरचा भाग शिकतो
FINE_TUNE_EPOCHS = 8  # टप्पा 2: pretrained चे काही layers हळूहळू सुधारतो
FINE_TUNE_LAYERS = 30


def load_split(name, shuffle):
    return keras.utils.image_dataset_from_directory(
        DATA_DIR / name,
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        shuffle=shuffle,
        seed=SEED,
    )


def build_model(num_classes):
    # Preprocessing (0-255 -> -1..1) आणि augmentation मॉडेलच्या आतच आहेत,
    # म्हणून predict करताना वेगळं काही करावं लागत नाही. Augmentation फक्त training मध्ये चालतं.
    inputs = keras.Input(shape=IMAGE_SIZE + (3,))
    x = layers.RandomFlip("horizontal_and_vertical")(inputs)
    x = layers.RandomRotation(0.1)(x)
    x = layers.RandomZoom(0.1)(x)
    x = layers.RandomContrast(0.1)(x)
    x = layers.Rescaling(scale=1 / 127.5, offset=-1)(x)

    base_model = keras.applications.MobileNetV2(
        input_shape=IMAGE_SIZE + (3,), include_top=False, weights="imagenet"
    )
    base_model.trainable = False  # सुरुवातीला pretrained भाग गोठवलेला
    x = base_model(x, training=False)

    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)
    return keras.Model(inputs, outputs), base_model


def class_weights_from(ds, num_classes):
    counts = np.zeros(num_classes)
    for _, labels in ds:
        for label in labels.numpy():
            counts[label] += 1
    total = counts.sum()
    # कमी फोटो असलेल्या class ला जास्त महत्त्व
    return {i: float(total / (num_classes * c)) for i, c in enumerate(counts)}


def evaluate_on_test(model, test_ds, class_names):
    y_true, y_pred = [], []
    for images, labels in test_ds:
        probs = model.predict(images, verbose=0)
        y_true.extend(labels.numpy().tolist())
        y_pred.extend(np.argmax(probs, axis=1).tolist())

    n = len(class_names)
    matrix = np.zeros((n, n), dtype=int)
    for t, p in zip(y_true, y_pred):
        matrix[t][p] += 1

    print("\n===== TEST निकाल (मॉडेलने हे फोटो आधी कधीच पाहिले नाहीत) =====")
    print(f"{'Class':<20}{'precision':>10}{'recall':>10}{'photos':>8}")
    report = {}
    for i, name in enumerate(class_names):
        tp = matrix[i][i]
        precision = tp / matrix[:, i].sum() if matrix[:, i].sum() else 0.0
        recall = tp / matrix[i, :].sum() if matrix[i, :].sum() else 0.0
        report[name] = {
            "precision": round(float(precision), 3),
            "recall": round(float(recall), 3),
            "photos": int(matrix[i, :].sum()),
        }
        print(f"{name:<20}{precision:>10.2f}{recall:>10.2f}{matrix[i, :].sum():>8}")

    accuracy = float(np.trace(matrix) / matrix.sum())
    print(f"\nएकूण accuracy: {accuracy:.2%}")
    print("Confusion matrix (ओळी = खरी class, स्तंभ = मॉडेलचा अंदाज):")
    print(class_names)
    print(matrix)

    with open(MODEL_DIR / "test_report.json", "w", encoding="utf-8") as f:
        json.dump(
            {"accuracy": round(accuracy, 4), "per_class": report,
             "confusion_matrix": matrix.tolist()},
            f, ensure_ascii=False, indent=2,
        )


def main():
    train_ds = load_split("train", shuffle=True)
    val_ds = load_split("val", shuffle=False)
    test_ds = load_split("test", shuffle=False)

    class_names = train_ds.class_names
    print("Classes:", class_names)

    weights = class_weights_from(train_ds, len(class_names))
    print("Class weights:", weights)

    autotune = tf.data.AUTOTUNE
    train_ds = train_ds.prefetch(autotune)
    val_ds = val_ds.prefetch(autotune)

    model, base_model = build_model(len(class_names))

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=4, restore_best_weights=True
        )
    ]

    # ---- टप्पा 1: फक्त नवीन वरचा भाग train ----
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(train_ds, validation_data=val_ds, epochs=HEAD_EPOCHS,
              class_weight=weights, callbacks=callbacks)

    # ---- टप्पा 2: Fine-tuning (खूप कमी learning rate) ----
    base_model.trainable = True
    for layer in base_model.layers[:-FINE_TUNE_LAYERS]:
        layer.trainable = False
    model.compile(
        optimizer=keras.optimizers.Adam(1e-5),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(train_ds, validation_data=val_ds, epochs=FINE_TUNE_EPOCHS,
              class_weight=weights, callbacks=callbacks)

    evaluate_on_test(model, test_ds, class_names)

    model.save(MODEL_DIR / "pomegranate_model.keras")
    with open(MODEL_DIR / "class_names.json", "w", encoding="utf-8") as f:
        json.dump(class_names, f, ensure_ascii=False)
    print(f"\nमॉडेल जतन केलं: {MODEL_DIR}")


if __name__ == "__main__":
    main()
