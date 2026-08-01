export type Locale = "zh-CN" | "en";
export type Side = "prussian" | "austrian";
export type GamePhase = "move" | "attack";
export type UnitStatus = "active" | "disordered";
export type SetupMode = "random" | "historical" | "free";

export interface GameOptions {
  prussianMustEngage: boolean;
}

export type Terrain =
  | "clear"
  | "woods"
  | "town"
  | "marsh"
  | "stream"
  | "elbe";

export type UnitKind =
  | "infantry"
  | "grenadier"
  | "lightInfantry"
  | "cavalry"
  | "lightCavalry"
  | "artillery";

export type HexId = `${number},${number}`;

export interface AxialCoord {
  q: number;
  r: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface HexCell {
  id: HexId;
  col: number;
  row: number;
  axial: AxialCoord;
  center: PixelPoint;
  terrain: Terrain[];
  elevationLevel: 0 | 1 | 2;
  road: boolean;
  bridge: boolean;
  fieldworks: boolean;
  victory: boolean;
}

export interface UnitStats {
  attack: number;
  range: number;
  movement: number;
  defense: number;
}

export interface Unit {
  id: string;
  side: Side;
  kind: UnitKind;
  stats: UnitStats;
  hexId: HexId | null;
  status: UnitStatus;
}

export interface GameLogEntry {
  id: number;
  key: string;
  values?: Record<string, string | number>;
  side?: Side;
}

export interface PendingPursuit {
  destination: HexId;
  eligibleUnitIds: string[];
}

export interface PendingRetreat {
  defenderId: string;
  attackerIds: string[];
  origin: HexId;
  destinations: HexId[];
  mayHold: boolean;
}

export interface GameState {
  setupMode: SetupMode;
  options: GameOptions;
  prussianEngagementRequired: boolean;
  turn: number;
  activeSide: Side;
  phase: GamePhase;
  units: Unit[];
  movedThisTurn: string[];
  attackedThisTurn: string[];
  pendingRetreat: PendingRetreat | null;
  pendingPursuit: PendingPursuit | null;
  log: GameLogEntry[];
  winner: Side | null;
}

export interface LinePath {
  hexes: HexId[];
  blockers: HexId[];
}

export interface LineOfSightResult {
  inRange: boolean;
  visible: boolean;
  distance: number;
  chosenPath: HexId[];
  alternatePath: HexId[];
  blockers: HexId[];
  reason:
    | "clear"
    | "outOfRange"
    | "terrain"
    | "unit"
    | "terrainAndUnit";
}

export interface AttackValidation {
  legal: boolean;
  key: string;
  lineOfSight: LineOfSightResult;
}

export interface CombinedAttackValidation {
  legal: boolean;
  key: string;
  lineOfSights: LineOfSightResult[];
  attackFactor: number;
}

export interface AttackResolution {
  state: GameState;
  die: number;
  attackFactor: number;
  attackTotal: number;
  defenseBase: number;
  defenseTerrainBonus: number;
  defenseFieldworksBonus: number;
  defenseElevationBonus: number;
  defenseTotal: number;
  outcome:
    | "noEffect"
    | "pendingRetreat"
    | "disordered"
    | "retreated"
    | "eliminated";
  outcomeReason:
    | "noEffect"
    | "retreatChoice"
    | "held"
    | "retreat"
    | "margin"
    | "alreadyDisordered"
    | "noRetreat";
  retreatHex?: HexId;
}

export type GameAction =
  | { type: "load"; state: GameState }
  | { type: "setPhase"; phase: GamePhase }
  | { type: "move"; unitId: string; destination: HexId }
  | { type: "attack"; attackerIds: string[]; defenderId: string; die?: number }
  | { type: "retreat"; destination: HexId | null }
  | { type: "pursue"; unitId: string | null }
  | { type: "endTurn" }
  | { type: "reset" };
