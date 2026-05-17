"""Crop the top-left magic-wand icon from the Auspex logos composite, convert
its white background to transparency with anti-aliased edges, and save it as
the site logo.

Run as: .venv/bin/python scripts/crop_logo.py [SOURCE_PATH]
"""

import sys
from pathlib import Path
from PIL import Image

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1
              else "/Users/mac/Documents/2026-05-15 17.40.45.jpg")
PROBE_DIR = Path("/Users/mac/Downloads/polymarket-builder/scripts/_probe")
DEST = Path("/Users/mac/Downloads/polymarket-builder/ui/public/logo.png")

# Crop box (left, upper, right, lower) — tuned for a 1280x853 source where
# the top-left cell is roughly (0..640, 0..284) and the icon sits in the
# upper-left portion of that cell with comfortable padding.
CROP_BOX = (35, 5, 285, 285)


def white_to_alpha(img: Image.Image) -> Image.Image:
    """Convert near-white pixels to transparent with anti-aliased falloff.

    Anti-aliased edges (gray pixels between the icon and the background)
    become partially transparent, preserving the smooth look on a dark
    background.
    """
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            # Distance from white = darkness. A pixel that is purely white
            # (255,255,255) has distance 0 → alpha 0. A pixel at 50% gray
            # has distance 127 → alpha ~255 (fully opaque).
            dist = max(255 - r, 255 - g, 255 - b)
            alpha = min(255, dist * 4)
            pixels[x, y] = (r, g, b, alpha)
    return img


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"source not found: {SOURCE}")
    img = Image.open(SOURCE)
    print(f"loaded {SOURCE.name} {img.size} {img.mode}")

    cropped = img.crop(CROP_BOX)
    print(f"cropped to {cropped.size} at {CROP_BOX}")

    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    raw_probe = PROBE_DIR / "logo_raw.png"
    cropped.save(raw_probe)
    print(f"saved raw probe → {raw_probe}")

    transparent = white_to_alpha(cropped)
    transparent.save(PROBE_DIR / "logo_alpha.png")

    # Square up: pad to square if not already, then resize to 256x256.
    w, h = transparent.size
    side = max(w, h)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(transparent, ((side - w) // 2, (side - h) // 2))
    final = square.resize((256, 256), Image.LANCZOS)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    final.save(DEST, optimize=True)
    print(f"final 256x256 transparent PNG → {DEST}")


if __name__ == "__main__":
    main()
