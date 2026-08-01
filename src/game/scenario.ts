import {
  EVEN_COLUMN_Y,
  HEX_X_SPACING,
  HEX_Y_SPACING,
  ODD_COLUMN_Y,
  offsetToAxial,
  toHexId
} from "./hex";
import { elevationLevelFor } from "./terrainEdges";
import type {
  GameOptions,
  GameState,
  HexCell,
  HexId,
  SetupMode,
  Side,
  Terrain,
  Unit,
  UnitKind,
  UnitStats
} from "./types";

const terrainSets: Partial<Record<Terrain, Set<HexId>>> = {
  woods: new Set([
    "0,0",
    "1,0",
    "1,1",
    "2,0",
    "2,1",
    "3,0",
    "3,1",
    "0,4",
    "0,5",
    "0,6",
    "0,7"
  ]),
  town: new Set(["5,0", "3,3", "6,2", "7,3", "5,6", "3,10"]),
  marsh: new Set([
    "4,7",
    "4,8",
    "4,9",
    "5,7",
    "5,10",
    "6,6",
    "8,5"
  ]),
  elbe: new Set(["6,0", "6,1", "7,2", "8,2"])
};

export const ROAD_HEXES = new Set<HexId>([
  "0,1",
  "1,2",
  "2,2",
  "3,3",
  "4,3",
  "5,4",
  "6,3",
  "7,3",
  "8,3",
  "5,0",
  "5,1",
  "5,2",
  "6,2",
  "7,4",
  "7,5",
  "7,6",
  "7,7",
  "8,7",
  "8,8"
]);
export const BRIDGE_HEXES = new Set<HexId>(["7,6"]);
const fieldworks = new Set<HexId>(["7,4", "7,5"]);
const victoryHexes = new Set<HexId>(["6,2", "7,3"]);

function terrainFor(id: HexId): Terrain[] {
  const terrain = (Object.entries(terrainSets) as [Terrain, Set<HexId>][])
    .filter(([, ids]) => ids.has(id))
    .map(([kind]) => kind);
  return terrain.length > 0 ? terrain : ["clear"];
}

export const BOARD_CELLS: HexCell[] = Array.from({ length: 9 }, (_, col) => {
  const rowCount = col % 2 === 0 ? 10 : 11;
  return Array.from({ length: rowCount }, (_, row) => {
    const id = toHexId(col, row);
    return {
      id,
      col,
      row,
      axial: offsetToAxial(col, row),
      center: {
        x: 175.65 + col * HEX_X_SPACING,
        y: (col % 2 === 0 ? EVEN_COLUMN_Y : ODD_COLUMN_Y) + row * HEX_Y_SPACING
      },
      terrain: terrainFor(id),
      elevationLevel: elevationLevelFor(id),
      road: ROAD_HEXES.has(id),
      bridge: BRIDGE_HEXES.has(id),
      fieldworks: fieldworks.has(id),
      victory: victoryHexes.has(id)
    };
  });
}).flat();

export const BOARD_BY_ID = new Map(BOARD_CELLS.map((cell) => [cell.id, cell]));

const statsByKind: Record<UnitKind, UnitStats> = {
  infantry: { attack: 2, range: 2, movement: 2, defense: 6 },
  grenadier: { attack: 4, range: 2, movement: 2, defense: 7 },
  lightInfantry: { attack: 2, range: 2, movement: 3, defense: 7 },
  cavalry: { attack: 3, range: 1, movement: 3, defense: 5 },
  lightCavalry: { attack: 2, range: 1, movement: 4, defense: 5 },
  artillery: { attack: 3, range: 4, movement: 1, defense: 4 }
};

function unit(
  id: string,
  side: Side,
  kind: UnitKind,
  col: number,
  row: number,
  stats?: Partial<UnitStats>
): Unit {
  return {
    id,
    side,
    kind,
    stats: { ...statsByKind[kind], ...stats },
    hexId: toHexId(col, row),
    status: "active"
  };
}

function offboardUnit(
  id: string,
  side: Side,
  kind: UnitKind,
  stats?: Partial<UnitStats>
): Unit {
  return {
    id,
    side,
    kind,
    stats: { ...statsByKind[kind], ...stats },
    hexId: null,
    status: "active"
  };
}

export function createUnitRoster(): Unit[] {
  return [
    ...Array.from({ length: 6 }, (_, index) =>
      offboardUnit(`P-I-${index + 1}`, "prussian", "infantry")
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      offboardUnit(`P-G-${index + 1}`, "prussian", "grenadier")
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      offboardUnit(`P-C-${index + 1}`, "prussian", "cavalry")
    ),
    offboardUnit("P-C-4", "prussian", "cavalry", { movement: 4 }),
    ...Array.from({ length: 2 }, (_, index) =>
      offboardUnit(`P-A-${index + 1}`, "prussian", "artillery")
    ),

    ...Array.from({ length: 5 }, (_, index) =>
      offboardUnit(`A-I-${index + 1}`, "austrian", "infantry")
    ),
    offboardUnit("A-G-1", "austrian", "grenadier"),
    ...Array.from({ length: 2 }, (_, index) =>
      offboardUnit(`A-LI-${index + 1}`, "austrian", "lightInfantry")
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      offboardUnit(`A-C-${index + 1}`, "austrian", "cavalry")
    ),
    offboardUnit("A-LC-1", "austrian", "lightCavalry"),
    offboardUnit("A-A-1", "austrian", "artillery")
  ];
}

export const HISTORICAL_DEPLOYMENT = {
  prussian: {
    infantry: ["0,1", "0,2", "0,3", "1,2", "1,3", "1,4", "2,2", "3,3"],
    cavalry: ["2,3", "2,4", "2,6", "2,7"],
    artillery: ["1,5", "1,6"]
  },
  austrian: {
    infantry: ["5,0", "5,1", "5,8", "6,2", "6,7", "7,7"],
    lightInfantry: ["2,0", "7,5"],
    cavalry: ["5,5", "5,9", "6,4", "6,9"],
    lightCavalry: ["6,5"],
    artillery: ["7,4"]
  }
} as const satisfies Record<
  Side,
  Partial<Record<UnitKind, readonly HexId[]>>
>;

function takeRandomSlots(
  slots: readonly HexId[],
  count: number,
  random: () => number
): { selected: HexId[]; remaining: HexId[] } {
  const remaining = [...slots];
  const selected: HexId[] = [];
  while (selected.length < count) {
    const index = Math.min(
      remaining.length - 1,
      Math.floor(Math.max(0, random()) * remaining.length)
    );
    selected.push(remaining.splice(index, 1)[0]);
  }
  return { selected, remaining };
}

function unitAt(
  id: string,
  side: Side,
  kind: UnitKind,
  hexId: HexId,
  stats?: Partial<UnitStats>
): Unit {
  const [col, row] = hexId.split(",").map(Number);
  return unit(id, side, kind, col, row, stats);
}

export function createHistoricalUnits(random = Math.random): Unit[] {
  const prussianInfantry = takeRandomSlots(
    HISTORICAL_DEPLOYMENT.prussian.infantry,
    2,
    random
  );
  const austrianInfantry = takeRandomSlots(
    HISTORICAL_DEPLOYMENT.austrian.infantry,
    1,
    random
  );
  const prussianCavalry = takeRandomSlots(
    HISTORICAL_DEPLOYMENT.prussian.cavalry,
    1,
    random
  );

  return [
    ...prussianInfantry.remaining.map((hexId, index) =>
      unitAt(`P-I-${index + 1}`, "prussian", "infantry", hexId)
    ),
    ...prussianInfantry.selected.map((hexId, index) =>
      unitAt(`P-G-${index + 1}`, "prussian", "grenadier", hexId)
    ),
    ...prussianCavalry.remaining.map((hexId, index) =>
      unitAt(`P-C-${index + 1}`, "prussian", "cavalry", hexId)
    ),
    ...prussianCavalry.selected.map((hexId, index) =>
      unitAt(
        `P-C-${prussianCavalry.remaining.length + index + 1}`,
        "prussian",
        "cavalry",
        hexId,
        { movement: 4 }
      )
    ),
    ...HISTORICAL_DEPLOYMENT.prussian.artillery.map((hexId, index) =>
      unitAt(`P-A-${index + 1}`, "prussian", "artillery", hexId)
    ),

    ...austrianInfantry.remaining.map((hexId, index) =>
      unitAt(`A-I-${index + 1}`, "austrian", "infantry", hexId)
    ),
    ...austrianInfantry.selected.map((hexId, index) =>
      unitAt(`A-G-${index + 1}`, "austrian", "grenadier", hexId)
    ),
    ...HISTORICAL_DEPLOYMENT.austrian.lightInfantry.map((hexId, index) =>
      unitAt(`A-LI-${index + 1}`, "austrian", "lightInfantry", hexId)
    ),
    ...HISTORICAL_DEPLOYMENT.austrian.cavalry.map((hexId, index) =>
      unitAt(`A-C-${index + 1}`, "austrian", "cavalry", hexId)
    ),
    ...HISTORICAL_DEPLOYMENT.austrian.lightCavalry.map((hexId, index) =>
      unitAt(`A-LC-${index + 1}`, "austrian", "lightCavalry", hexId)
    ),
    ...HISTORICAL_DEPLOYMENT.austrian.artillery.map((hexId, index) =>
      unitAt(`A-A-${index + 1}`, "austrian", "artillery", hexId)
    )
  ];
}

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  prussianMustEngage: true
};

export function createInitialStateFromUnits(
  units: Unit[],
  setupMode: SetupMode,
  options: GameOptions = DEFAULT_GAME_OPTIONS
): GameState {
  return {
    setupMode,
    options: { ...options },
    prussianEngagementRequired: false,
    turn: 1,
    activeSide: "prussian",
    phase: "move",
    units: units.map((piece) => ({
      ...piece,
      stats: { ...piece.stats },
      status: "active"
    })),
    movedThisTurn: [],
    attackedThisTurn: [],
    pendingRetreat: null,
    pendingPursuit: null,
    winner: null,
    log: [{ id: 1, key: "log.gameReady", side: "prussian" }]
  };
}

export function createInitialState(
  random = Math.random,
  options: GameOptions = DEFAULT_GAME_OPTIONS
): GameState {
  return createInitialStateFromUnits(
    createHistoricalUnits(random),
    "random",
    options
  );
}
