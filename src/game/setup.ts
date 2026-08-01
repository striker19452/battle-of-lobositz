import { HISTORICAL_DEPLOYMENT, createUnitRoster } from "./scenario";
import type { HexId, SetupMode, Side, Unit, UnitKind } from "./types";

export type ManualSetupMode = Exclude<SetupMode, "random">;

export interface DeploymentState {
  mode: ManualSetupMode;
  units: Unit[];
  activeSide: Side;
  placementOrder: string[];
}

export const SETUP_HEXES_BY_SIDE: Record<Side, readonly HexId[]> = {
  prussian: [
    ...HISTORICAL_DEPLOYMENT.prussian.infantry,
    ...HISTORICAL_DEPLOYMENT.prussian.cavalry,
    ...HISTORICAL_DEPLOYMENT.prussian.artillery
  ],
  austrian: [
    ...HISTORICAL_DEPLOYMENT.austrian.infantry,
    ...HISTORICAL_DEPLOYMENT.austrian.lightInfantry,
    ...HISTORICAL_DEPLOYMENT.austrian.cavalry,
    ...HISTORICAL_DEPLOYMENT.austrian.lightCavalry,
    ...HISTORICAL_DEPLOYMENT.austrian.artillery
  ]
};

const HISTORICAL_CHOICE_IDS = new Set(["A-G-1", "P-G-1", "P-G-2", "P-C-4"]);

function opposite(side: Side): Side {
  return side === "prussian" ? "austrian" : "prussian";
}

function historicalSlots(unit: Unit): readonly HexId[] {
  const symbolKind: UnitKind =
    unit.kind === "grenadier" ? "infantry" : unit.kind;
  const deployment = HISTORICAL_DEPLOYMENT[unit.side] as Partial<
    Record<UnitKind, readonly HexId[]>
  >;
  return deployment[symbolKind] ?? [];
}

function historicalChoicesComplete(units: Unit[], side: Side): boolean {
  return units
    .filter((unit) => unit.side === side && HISTORICAL_CHOICE_IDS.has(unit.id))
    .every((unit) => unit.hexId !== null);
}

function fillHistoricalSide(units: Unit[], side: Side): Unit[] {
  const occupied = new Set(
    units.flatMap((unit) => (unit.hexId ? [unit.hexId] : []))
  );
  return units.map((unit) => {
    if (
      unit.side !== side ||
      HISTORICAL_CHOICE_IDS.has(unit.id) ||
      unit.hexId !== null
    ) {
      return unit;
    }
    const destination = historicalSlots(unit).find(
      (hexId) => !occupied.has(hexId)
    );
    if (!destination) return unit;
    occupied.add(destination);
    return { ...unit, hexId: destination };
  });
}

export function isDeploymentSelectable(
  state: DeploymentState,
  unit: Unit
): boolean {
  return (
    unit.side === state.activeSide &&
    (state.mode === "free" || HISTORICAL_CHOICE_IDS.has(unit.id))
  );
}

export function createDeploymentState(mode: ManualSetupMode): DeploymentState {
  return {
    mode,
    units: createUnitRoster(),
    activeSide: "austrian",
    placementOrder: []
  };
}

export function getDeploymentLegalHexes(
  state: DeploymentState,
  unitId: string
): Set<HexId> {
  const unit = state.units.find((piece) => piece.id === unitId);
  if (!unit || !isDeploymentSelectable(state, unit)) return new Set();

  const occupied = new Set(
    state.units.flatMap((piece) =>
      piece.id !== unit.id && piece.hexId ? [piece.hexId] : []
    )
  );
  const slots =
    state.mode === "historical"
      ? historicalSlots(unit)
      : SETUP_HEXES_BY_SIDE[unit.side];

  return new Set(slots.filter((hexId) => !occupied.has(hexId)));
}

export function placeDeploymentUnit(
  state: DeploymentState,
  unitId: string,
  destination: HexId
): DeploymentState {
  const unit = state.units.find((piece) => piece.id === unitId);
  if (!unit || !getDeploymentLegalHexes(state, unitId).has(destination)) {
    return state;
  }
  if (unit.hexId === destination) return state;

  const newlyPlaced = unit.hexId === null;
  let units = state.units.map((piece) =>
    piece.id === unitId ? { ...piece, hexId: destination } : piece
  );
  let activeSide = state.activeSide;

  if (newlyPlaced && state.mode === "free") {
    activeSide = opposite(state.activeSide);
  } else if (
    newlyPlaced &&
    state.mode === "historical" &&
    historicalChoicesComplete(units, state.activeSide)
  ) {
    units = fillHistoricalSide(units, state.activeSide);
    if (state.activeSide === "austrian") activeSide = "prussian";
  }

  return {
    ...state,
    units,
    activeSide,
    placementOrder: newlyPlaced
      ? [...state.placementOrder, unitId]
      : state.placementOrder
  };
}

export function undoDeployment(state: DeploymentState): DeploymentState {
  const unitId = state.placementOrder.at(-1);
  if (!unitId) return state;
  const unit = state.units.find((piece) => piece.id === unitId);
  if (!unit) return state;

  return {
    ...state,
    units: state.units.map((piece) => {
      if (piece.id === unitId) return { ...piece, hexId: null };
      if (
        state.mode === "historical" &&
        piece.side === unit.side &&
        !HISTORICAL_CHOICE_IDS.has(piece.id)
      ) {
        return { ...piece, hexId: null };
      }
      return piece;
    }),
    activeSide: unit.side,
    placementOrder: state.placementOrder.slice(0, -1)
  };
}

export function deploymentComplete(state: DeploymentState): boolean {
  return state.units.every((unit) => unit.hexId !== null);
}

export function deploymentPlacementsRemaining(state: DeploymentState): number {
  return state.units.filter(
    (unit) =>
      unit.hexId === null &&
      (state.mode === "free" || HISTORICAL_CHOICE_IDS.has(unit.id))
  ).length;
}
