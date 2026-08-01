from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "public" / "assets" / "field.png"
OUTPUT_PATH = ROOT / ".vite-qa" / "hex-index.png"
HEX_X_SPACING = 183.33
HEX_Y_SPACING = 211.76
EVEN_COLUMN_Y = 388.42
ODD_COLUMN_Y = 282.6


def main() -> None:
    source = Image.open(MAP_PATH).convert("RGB")
    tile_size = 176
    crop_size = 156
    sheet = Image.new("RGB", (9 * tile_size, 11 * tile_size), (34, 39, 28))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)

    for col in range(9):
        row_count = 10 if col % 2 == 0 else 11
        y_origin = EVEN_COLUMN_Y if col % 2 == 0 else ODD_COLUMN_Y
        for row in range(row_count):
            center_x = round(175.65 + col * HEX_X_SPACING)
            center_y = round(y_origin + row * HEX_Y_SPACING)
            crop = source.crop(
                (
                    center_x - crop_size // 2,
                    center_y - crop_size // 2,
                    center_x + crop_size // 2,
                    center_y + crop_size // 2,
                )
            )
            x = col * tile_size + 10
            y = row * tile_size + 10
            sheet.paste(crop, (x, y))
            draw.rectangle((x, y, x + 64, y + 25), fill=(25, 30, 21))
            draw.text((x + 6, y + 3), f"{col},{row}", fill=(255, 244, 190), font=font)
            draw.rectangle(
                (x, y, x + crop_size, y + crop_size),
                outline=(124, 137, 92),
                width=2,
            )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
