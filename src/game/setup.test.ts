import { describe, expect, it } from "vitest";
import {
  SETUP_HEXES_BY_SIDE,
  createDeploymentState,
  deploymentComplete,
  getDeploymentLegalHexes,
  placeDeploymentUnit,
  undoDeployment,
  type DeploymentState
} from "./setup";

function placeNextUnit(state: DeploymentState): DeploymentState {
  const unit = state.units.find(
    (piece) =>
      piece.side === state.activeSide &&
      piece.hexId === null &&
      getDeploymentLegalHexes(state, piece.id).size > 0
  );
  if (!unit) return state;
  const destination = [...getDeploymentLegalHexes(state, unit.id)][0];
  return placeDeploymentUnit(state, unit.id, destination);
}

describe("manual deployment", () => {
  it("creates the complete historical roster off board", () => {
    const state = createDeploymentState("historical");

    expect(state.units).toHaveLength(28);
    expect(state.units.every((unit) => unit.hexId === null)).toBe(true);
    expect(state.activeSide).toBe("austrian");
    expect(
      state.units.filter(
        (unit) => unit.side === "prussian" && unit.kind === "grenadier"
      )
    ).toHaveLength(2);
    expect(
      state.units.filter(
        (unit) =>
          unit.side === "prussian" &&
          unit.kind === "cavalry" &&
          unit.stats.movement === 4
      )
    ).toHaveLength(1);
  });

  it("requires matching symbols in historical setup and deploys Austria first", () => {
    let state = createDeploymentState("historical");
    const grenadierSlots = getDeploymentLegalHexes(state, "A-G-1");

    expect([...grenadierSlots].sort()).toEqual(
      [...SETUP_HEXES_BY_SIDE.austrian.slice(0, 6)].sort()
    );
    expect(getDeploymentLegalHexes(state, "A-C-1").size).toBe(0);
    expect(getDeploymentLegalHexes(state, "P-I-1").size).toBe(0);

    while (state.activeSide === "austrian") state = placeNextUnit(state);

    expect(state.activeSide).toBe("prussian");
    expect(getDeploymentLegalHexes(state, "P-C-4").has("2,3")).toBe(true);
    expect(getDeploymentLegalHexes(state, "P-C-4").has("0,1")).toBe(false);
    expect(
      state.units
        .filter((unit) => unit.side === "austrian")
        .every((unit) => unit.hexId !== null)
    ).toBe(true);
  });

  it("alternates sides and ignores troop symbols in free setup", () => {
    let state = createDeploymentState("free");

    expect(getDeploymentLegalHexes(state, "A-G-1").has("5,5")).toBe(true);
    state = placeDeploymentUnit(state, "A-G-1", "5,5");
    expect(state.activeSide).toBe("prussian");
    expect(getDeploymentLegalHexes(state, "P-A-1").has("0,1")).toBe(true);
    state = placeDeploymentUnit(state, "P-A-1", "0,1");
    expect(state.activeSide).toBe("austrian");

    state = undoDeployment(state);
    expect(state.activeSide).toBe("prussian");
    expect(state.units.find((unit) => unit.id === "P-A-1")?.hexId).toBeNull();
  });

  it("auto-fills ordinary historical units after the four special choices", () => {
    let state = createDeploymentState("historical");

    state = placeDeploymentUnit(state, "A-G-1", "5,0");
    expect(state.activeSide).toBe("prussian");
    expect(
      state.units
        .filter((unit) => unit.side === "austrian")
        .every((unit) => unit.hexId !== null)
    ).toBe(true);

    state = placeDeploymentUnit(state, "P-G-1", "0,1");
    state = placeDeploymentUnit(state, "P-G-2", "0,2");
    state = placeDeploymentUnit(state, "P-C-4", "2,3");

    expect(deploymentComplete(state)).toBe(true);
    expect(state.placementOrder).toEqual(["A-G-1", "P-G-1", "P-G-2", "P-C-4"]);
    expect(state.units.find((unit) => unit.id === "P-C-4")?.hexId).toBe("2,3");

    state = undoDeployment(state);
    expect(deploymentComplete(state)).toBe(false);
    expect(state.units.find((unit) => unit.id === "P-C-4")?.hexId).toBeNull();
    expect(
      state.units
        .filter(
          (unit) =>
            unit.side === "prussian" &&
            !["P-G-1", "P-G-2", "P-C-4"].includes(unit.id)
        )
        .every((unit) => unit.hexId === null)
    ).toBe(true);
  });

  it("can legally complete both manual setup modes without stacking", () => {
    for (const mode of ["historical", "free"] as const) {
      let state = createDeploymentState(mode);
      while (!deploymentComplete(state)) state = placeNextUnit(state);

      expect(new Set(state.units.map((unit) => unit.hexId)).size).toBe(28);
      expect(deploymentComplete(state)).toBe(true);
      expect(state.placementOrder).toHaveLength(mode === "historical" ? 4 : 28);
    }
  });
});
