import base64
import io

from PIL import Image, ImageFile

# Prevent loading truncated images
ImageFile.LOAD_TRUNCATED_IMAGES = False

# Prevent decompression bombs
Image.MAX_IMAGE_PIXELS = 20_000_000

ALLOWED_FORMATS = {
    "JPEG",
    "PNG",
    "WEBP",
}

MAX_WIDTH = 4096
MAX_HEIGHT = 4096


class InvalidImage(Exception):
    pass


def validate_base64_image(image_b64: str):
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception:
        raise InvalidImage("Invalid Base64.")

    try:
        img = Image.open(io.BytesIO(image_bytes))

        # Verify file integrity
        img.verify()

        # Re-open after verify()
        img = Image.open(io.BytesIO(image_bytes))

    except Exception:
        raise InvalidImage("Corrupted image.")

    if img.format not in ALLOWED_FORMATS:
        raise InvalidImage(
            f"Unsupported image format: {img.format}"
        )

    width, height = img.size

    if width > MAX_WIDTH or height > MAX_HEIGHT:
        raise InvalidImage(
            "Image dimensions exceed the allowed limit."
        )

    return img