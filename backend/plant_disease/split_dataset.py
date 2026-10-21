"""
dataset/ मधल्या फोटोंचे train / val / test असे तीन भाग करतो (70% / 15% / 15%).

हे training च्या आधी, एकदाच चालवायचं. फोटो copy होतात, मूळ dataset/ फोल्डर तसाच राहतो.
Augmentation नंतर (train.py मध्ये) फक्त train भागावर होतो, म्हणून एकाच फोटोची
वेगवेगळी रूपं वेगवेगळ्या भागांत जात नाहीत.

चालवा:  python -m plant_disease.split_dataset
"""
import random
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SOURCE_DIR = BASE_DIR / "dataset"
TARGET_DIR = BASE_DIR / "data_split"

TRAIN_FRACTION = 0.70
VAL_FRACTION = 0.15  # बाकीचे 15% test साठी
SEED = 42
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main():
    if not SOURCE_DIR.exists():
        raise SystemExit(f"dataset फोल्डर सापडला नाही: {SOURCE_DIR}")

    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)

    rng = random.Random(SEED)
    class_dirs = sorted(p for p in SOURCE_DIR.iterdir() if p.is_dir())
    if len(class_dirs) < 2:
        raise SystemExit("किमान 2 class फोल्डर हवेत (उदा. Healthy, Diseased).")

    print(f"{'Class':<20}{'train':>8}{'val':>8}{'test':>8}")
    for class_dir in class_dirs:
        images = sorted(
            p for p in class_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS
        )
        if len(images) < 10:
            raise SystemExit(
                f"{class_dir.name} मध्ये फक्त {len(images)} फोटो आहेत. किमान 10 हवेत."
            )

        rng.shuffle(images)
        n_train = int(len(images) * TRAIN_FRACTION)
        n_val = int(len(images) * VAL_FRACTION)
        parts = {
            "train": images[:n_train],
            "val": images[n_train:n_train + n_val],
            "test": images[n_train + n_val:],
        }

        for part_name, files in parts.items():
            out_dir = TARGET_DIR / part_name / class_dir.name
            out_dir.mkdir(parents=True, exist_ok=True)
            for file in files:
                shutil.copy2(file, out_dir / file.name)

        print(
            f"{class_dir.name:<20}{len(parts['train']):>8}"
            f"{len(parts['val']):>8}{len(parts['test']):>8}"
        )

    print(f"\nतयार: {TARGET_DIR}")


if __name__ == "__main__":
    main()
