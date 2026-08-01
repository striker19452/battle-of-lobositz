import type { AxialCoord, HexCell, HexId, PixelPoint } from "./types";

export const MAP_WIDTH = 1819;
export const MAP_HEIGHT = 2573;
export const HEX_SIZE = 122.22;
export const HEX_X_SPACING = 183.33;
export const HEX_Y_SPACING = 211.76;
export const EVEN_COLUMN_Y = 388.42;
export const ODD_COLUMN_Y = 282.6;

const AXIAL_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

export function toHexId(col: number, row: number): HexId {
  return `${col},${row}`;
}

export function offsetToAxial(col: number, row: number): AxialCoord {
  return {
    q: col,
    r: row - (col + (col & 1)) / 2
  };
}

export function axialToOffset(coord: AxialCoord): { col: number; row: number } {
  return {
    col: coord.q,
    row: coord.r + (coord.q + (coord.q & 1)) / 2
  };
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function getNeighborIds(cell: HexCell, cells: Map<HexId, HexCell>): HexId[] {
  return AXIAL_DIRECTIONS.flatMap((direction) => {
    const offset = axialToOffset({
      q: cell.axial.q + direction.q,
      r: cell.axial.r + direction.r
    });
    const id = toHexId(offset.col, offset.row);
    return cells.has(id) ? [id] : [];
  });
}

export function hexPolygonPoints(center: PixelPoint, inset = 3): string {
  const radius = HEX_SIZE - inset;
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (index * 60);
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

function axialToCube(coord: AxialCoord): CubeCoord {
  return {
    x: coord.q,
    z: coord.r,
    y: -coord.q - coord.r
  };
}

function cubeToAxial(cube: CubeCoord): AxialCoord {
  return { q: cube.x, r: cube.z };
}

function cubeLerp(a: CubeCoord, b: CubeCoord, amount: number): CubeCoord {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount
  };
}

function cubeRound(cube: CubeCoord): CubeCoord {
  let x = Math.round(cube.x);
  let y = Math.round(cube.y);
  let z = Math.round(cube.z);
  const xDiff = Math.abs(x - cube.x);
  const yDiff = Math.abs(y - cube.y);
  const zDiff = Math.abs(z - cube.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    x = -y - z;
  } else if (yDiff > zDiff) {
    y = -x - z;
  } else {
    z = -x - y;
  }

  return { x, y, z };
}

function nudge(cube: CubeCoord, sign: 1 | -1): CubeCoord {
  const epsilon = 1e-6 * sign;
  return {
    x: cube.x + epsilon,
    y: cube.y + epsilon,
    z: cube.z - 2 * epsilon
  };
}

export function axialLine(
  start: AxialCoord,
  end: AxialCoord,
  sign: 1 | -1 = 1
): AxialCoord[] {
  const distance = axialDistance(start, end);
  const from = nudge(axialToCube(start), sign);
  const to = nudge(axialToCube(end), sign);

  return Array.from({ length: distance + 1 }, (_, index) => {
    const amount = distance === 0 ? 0 : index / distance;
    return cubeToAxial(cubeRound(cubeLerp(from, to, amount)));
  });
}
