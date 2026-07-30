import base64
import io
from dataclasses import dataclass

from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False

# Prevent decompression bombs
Image.MAX_IMAGE_PIXELS = 20_000_000

ALLOWED_FORMATS = {
    "JPEG",
    "PNG",
}

MAX_IMAGE_DIMENSION = 1920

# Maximum allowed processed WebP size based on longest image dimension
SIZE_LIMITS = (
    (512, 250 * 1024),     # 250 KB
    (1024, 500 * 1024),    # 500 KB
    (1600, 800 * 1024),    # 800 KB
    (1920, 1200 * 1024),   # 1.2 MB
)

INITIAL_WEBP_QUALITY = 82
MIN_WEBP_QUALITY = 45
QUALITY_STEP = 5


class InvalidImage(Exception):
    pass


@dataclass
class ProcessedImage:
    data: bytes
    width: int
    height: int
    size_bytes: int


def get_max_size(width: int, height: int) -> int:
    """
    Returns the maximum allowed WebP size based on the
    longest image dimension.
    """
    longest = max(width, height)

    for dimension, limit in SIZE_LIMITS:
        if longest <= dimension:
            return limit

    return SIZE_LIMITS[-1][1]


def process_image(image_b64: str) -> ProcessedImage:
    """
    Process an uploaded image.

    Pipeline:
    - Decode Base64
    - Verify image integrity
    - Accept JPEG/PNG only
    - Flatten transparency onto a white background
    - Resize to max 1920px
    - Convert to WebP
    - Automatically reduce quality until size limit is met
    """

    # Decode Base64
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception:
        raise InvalidImage("Invalid Base64 image.")

    # Verify image integrity
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()

        # Pillow requires reopening after verify()
        img = Image.open(io.BytesIO(image_bytes))

    except Exception:
        raise InvalidImage("Corrupted image.")

    # Allow only JPEG and PNG uploads
    if img.format not in ALLOWED_FORMATS:
        raise InvalidImage("Only JPEG and PNG images are allowed.")

    # Flatten transparency
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        alpha = img.convert("RGBA")
        background.paste(alpha, mask=alpha.split()[3])
        img = background
    else:
        img = img.convert("RGB")

    # Resize while preserving aspect ratio
    img.thumbnail(
        (MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION),
        Image.Resampling.LANCZOS,
    )

    allowed_size = get_max_size(img.width, img.height)

    quality = INITIAL_WEBP_QUALITY

    while quality >= MIN_WEBP_QUALITY:

        output = io.BytesIO()

        img.save(
            output,
            format="WEBP",
            quality=quality,
            optimize=True,
            method=6,
        )

        webp_bytes = output.getvalue()

        if len(webp_bytes) <= allowed_size:
            return ProcessedImage(
                data=webp_bytes,
                width=img.width,
                height=img.height,
                size_bytes=len(webp_bytes),
            )

        quality -= QUALITY_STEP

    raise InvalidImage(
        "Image is too detailed to compress within the allowed size."
    )