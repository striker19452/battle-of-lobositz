from __future__ import annotations

from math import hypot
from pathlib import Path
import sys

from PIL import Image, ImageDraw


MAP_PATH = Path(__file__).resolve().parents[1] / "public" / "assets" / "field.png"
ELEVATION_COLOR = (237, 224, 98)
HEX_X_SPACING = 183.33
HEX_Y_SPACING = 211.76
EVEN_COLUMN_Y = 388.42
ODD_COLUMN_Y = 282.6


def cells() -> list[tuple[str, float, float]]:
    result: list[tuple[str, float, float]] = []
    for col in range(9):
        row_count = 10 if col % 2 == 0 else 11
        y_origin = EVEN_COLUMN_Y if col % 2 == 0 else ODD_COLUMN_Y
        for row in range(row_count):
            result.append(
                (
                    f"{col},{row}",
                    175.65 + col * HEX_X_SPACING,
                    y_origin + row * HEX_Y_SPACING,
                )
            )
    return result


def elevation_crossing(
    image: Image.Image,
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[int, tuple[int, int] | None]:
    hits: list[tuple[int, int]] = []
    for step in range(12, 309):
        ratio = step / 320
        x = round(start[0] + (end[0] - start[0]) * ratio)
        y = round(start[1] + (end[1] - start[1]) * ratio)
        if image.getpixel((x, y)) == ELEVATION_COLOR:
            hits.append((x, y))
    if not hits:
        return 0, None
    middle = hits[len(hits) // 2]
    return len(hits), middle


def main() -> None:
    image = Image.open(MAP_PATH).convert("RGB")
    board = cells()
    centers = {cell_id: (x, y) for cell_id, x, y in board}
    crossings: list[tuple[str, str, int, tuple[int, int]]] = []

    for index, (start_id, start_x, start_y) in enumerate(board):
        for end_id, end_x, end_y in board[index + 1 :]:
            if not 210 < hypot(end_x - start_x, end_y - start_y) < 214:
                continue
            hit_count, midpoint = elevation_crossing(
                image,
                (start_x, start_y),
                (end_x, end_y),
            )
            if midpoint is not None:
                crossings.append((start_id, end_id, hit_count, midpoint))

    for start_id, end_id, hit_count, midpoint in crossings:
        print(f"{start_id}|{end_id} hits={hit_count} near={midpoint[0]},{midpoint[1]}")
    print(f"total={len(crossings)}")

    if "--render" in sys.argv:
        overlay = image.copy()
        draw = ImageDraw.Draw(overlay, "RGBA")
        for start_id, end_id, _, midpoint in crossings:
            draw.line(
                [centers[start_id], centers[end_id]],
                fill=(215, 38, 35, 175),
                width=8,
            )
            draw.ellipse(
                [
                    midpoint[0] - 8,
                    midpoint[1] - 8,
                    midpoint[0] + 8,
                    midpoint[1] + 8,
                ],
                fill=(255, 245, 210, 240),
                outline=(125, 12, 12, 255),
                width=3,
            )
        output = MAP_PATH.parents[2] / ".vite-qa" / "elevation-crossings.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        overlay.save(output)
        print(f"rendered={output}")


if __name__ == "__main__":
    main()
