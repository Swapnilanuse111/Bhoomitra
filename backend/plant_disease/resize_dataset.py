"""
मोठ्या dataset चे फोटो लहान (जास्तीत जास्त 512 px) करून plant_disease/dataset/ मध्ये ठेवतो.

मॉडेल फक्त 224x224 पाहतं, म्हणून 4 GB चे फोटो ~300 MB होऊनही अचूकता कमी होत नाही,
आणि training खूप वेगवान होते. मूळ फोटो जसेच्या तसे राहतात.

चालवा (backend फोल्डरमध्ये):
    python -m plant_disease.resize_dataset "E:\\datasets\\pomegranate_raw"
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "dataset"

MAX_SIDE = 512
JPEG_QUALITY = 90
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('वापर: python -m plant_disease.resize_dataset "<मूळ dataset चा फोल्डर>"')

    source = Path(sys.argv[1])
    if not source.is_dir():
        raise SystemExit(f"फोल्डर सापडला नाही: {source}")

    counters = {}
    skipped = 0

    # ज्या फोल्डरमध्ये थेट फोटो असतात, त्या फोल्डरचं नाव = class चं नाव.
    for folder in sorted([source] + [p for p in source.rglob("*") if p.is_dir()]):
        images = sorted(
            p for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        )
        if not images:
            continue

        class_name = folder.name.strip().replace(" ", "_")
        out_dir = OUTPUT_DIR / class_name
        out_dir.mkdir(parents=True, exist_ok=True)
        index = counters.get(class_name, 0)

        for image_path in images:
            try:
                with Image.open(image_path) as img:
                    img = ImageOps.exif_transpose(img)  # मोबाईल फोटोची दिशा सुधारतो
                    img = img.convert("RGB")
                    img.thumbnail((MAX_SIDE, MAX_SIDE))
                    index += 1
                    img.save(out_dir / f"{class_name}_{index:05d}.jpg",
                             "JPEG", quality=JPEG_QUALITY)
            except Exception as error:  # खराब फाइल वगळतो
                skipped += 1
                print(f"वगळलं: {image_path.name} ({error})")

        counters[class_name] = index
        print(f"{class_name}: {index} फोटो")

    if not counters:
        raise SystemExit("कुठेच फोटो सापडले नाहीत. फोल्डरचा path तपासा.")

    total = sum(counters.values())
    size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*.jpg")) / (1024 * 1024)
    print(f"\nएकूण {len(counters)} class, {total} फोटो, आकार सुमारे {size_mb:.0f} MB")
    print(f"वगळलेले: {skipped}")
    print(f"तयार: {OUTPUT_DIR}")
    print("class ची यादी तपासा. 5 पेक्षा जास्त किंवा विचित्र नावाचा फोल्डर असेल तर तो डिलीट करा.")


if __name__ == "__main__":
    main()
