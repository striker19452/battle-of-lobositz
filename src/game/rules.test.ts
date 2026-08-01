import { describe, expect, it } from "vitest";
import { HEX_Y_SPACING, getNeighborIds } from "./hex";
import {
  BOARD_BY_ID,
  BOARD_CELLS,
  HISTORICAL_DEPLOYMENT,
  ROAD_HEXES,
  createHistoricalUnits,
  createInitialState
} from "./scenario";
import {
  ELEVATION_EDGES,
  ELEVATION_LINE_COUNT,
  crossesElevationLine
} from "./terrainEdges";
import {
  applyStartOfTurnRules,
  gameReducer,
  getEnemyZoc,
  getLegalMoves,
  getLineOfSight,
  getPursuitCandidates,
  resolveAttack,
  resolveRetreatChoice,
  validateAttack,
  validateCombinedAttack
} from "./rules";
import type { GameState, HexId, Terrain, Unit } from "./types";

function isolatedState(units: Unit[]): GameState {
  return {
    ...createInitialState(),
    phase: "attack",
    units,
    movedThisTurn: [],
    attackedThisTurn: [],
    log: []
  };
}

function piece(
  id: string,
  side: Unit["side"],
  kind: Unit["kind"],
  hexId: HexId,
  stats: Unit["stats"]
): Unit {
  return { id, side, kind, hexId, stats, status: "active" };
}

describe("Lobositz board", () => {
  it("contains the measured 94 playable hexes", () => {
    expect(BOARD_CELLS).toHaveLength(94);
  });

  it("keeps every rules-engine neighbor aligned with a printed adjacent hex", () => {
    for (const cell of BOARD_CELLS) {
      for (const neighborId of getNeighborIds(cell, BOARD_BY_ID)) {
        const neighbor = BOARD_BY_ID.get(neighborId)!;
        const pixelDistance = Math.hypot(
          neighbor.center.x - cell.center.x,
          neighbor.center.y - cell.center.y
        );
        expect(Math.abs(pixelDistance - HEX_Y_SPACING)).toBeLessThan(0.2);
      }
    }
  });

  it("does not project a zone of control from a disordered unit", () => {
    const austrian = piece("A-I", "austrian", "infantry", "4,5", {
      attack: 2,
      range: 2,
      movement: 2,
      defense: 6
    });
    const state = isolatedState([austrian]);

    expect(getEnemyZoc(state, "prussian").size).toBeGreaterThan(0);
    austrian.status = "disordered";
    expect(getEnemyZoc(state, "prussian")).toEqual(new Set());
  });

  it("lets cavalry at 4,9 cross the clear 3,9 and 3,8 hexes to 3,7", () => {
    const state = isolatedState([
      piece("A-C", "austrian", "cavalry", "4,9", {
        attack: 3,
        range: 1,
        movement: 3,
        defense: 5
      })
    ]);
    state.activeSide = "austrian";
    state.phase = "move";

    expect(BOARD_BY_ID.get("3,9")?.terrain).toEqual(["clear"]);
    expect(BOARD_BY_ID.get("3,8")?.terrain).toEqual(["clear"]);
    expect(BOARD_BY_ID.get("3,7")?.terrain).toEqual(["clear"]);
    expect(getLegalMoves(state, "A-C")).toContain("3,7");
  });

  it("matches every printed terrain and feature hex", () => {
    const terrainHexes = (terrain: Terrain) =>
      BOARD_CELLS.filter((cell) => cell.terrain.includes(terrain))
        .map((cell) => cell.id)
        .sort();

    expect(terrainHexes("woods")).toEqual(
      ["0,0", "0,4", "0,5", "0,6", "0,7", "1,0", "1,1", "2,0", "2,1", "3,0", "3,1"].sort()
    );
    expect(terrainHexes("town")).toEqual(
      ["3,3", "3,10", "5,0", "5,6", "6,2", "7,3"].sort()
    );
    expect(terrainHexes("stream")).toEqual([]);
    expect(terrainHexes("elbe")).toEqual(["6,0", "6,1", "7,2", "8,2"]);
    expect(terrainHexes("marsh")).toEqual(
      ["4,7", "4,8", "4,9", "5,7", "5,10", "6,6", "8,5"].sort()
    );
    expect([...ROAD_HEXES].sort()).toEqual(
      [
        "0,1",
        "1,2",
        "2,2",
        "3,3",
        "4,3",
        "5,0",
        "5,1",
        "5,2",
        "5,4",
        "6,2",
        "6,3",
        "7,3",
        "7,4",
        "7,5",
        "7,6",
        "7,7",
        "8,3",
        "8,7",
        "8,8"
      ].sort()
    );
    expect(
      BOARD_CELLS.filter((cell) => cell.fieldworks)
        .map((cell) => cell.id)
        .sort()
    ).toEqual(["7,4", "7,5"]);
    expect(
      BOARD_CELLS.filter((cell) => cell.victory)
        .map((cell) => cell.id)
        .sort()
    ).toEqual(["6,2", "7,3"]);
    expect(BOARD_BY_ID.get("7,6")).toMatchObject({
      terrain: ["clear"],
      road: true,
      bridge: true
    });
  });
});

describe("Prussian engagement obligation", () => {
  function engagementState(prussianHex: HexId, austrianHex: HexId): GameState {
    return {
      ...isolatedState([
        piece("P-I", "prussian", "infantry", prussianHex, {
          attack: 2,
          range: 2,
          movement: 2,
          defense: 6
        }),
        piece("A-I", "austrian", "infantry", austrianHex, {
          attack: 2,
          range: 2,
          movement: 2,
          defense: 6
        })
      ]),
      activeSide: "prussian",
      phase: "move",
      prussianEngagementRequired: false
    };
  }

  it("is enabled by default", () => {
    expect(createInitialState().options.prussianMustEngage).toBe(true);
  });

  it("does not impose movement when a Prussian unit already has an enemy in range", () => {
    const state = applyStartOfTurnRules(engagementState("4,5", "4,7"));

    expect(state.prussianEngagementRequired).toBe(false);
    expect(state.winner).toBeNull();
  });

  it("requires a qualifying move and clears the requirement when it is made", () => {
    const required = applyStartOfTurnRules(engagementState("4,4", "4,7"));

    expect(required.prussianEngagementRequired).toBe(true);
    expect(getLegalMoves(required, "P-I")).toContain("4,5");

    const fulfilled = gameReducer(required, {
      type: "move",
      unitId: "P-I",
      destination: "4,5"
    });
    expect(fulfilled.prussianEngagementRequired).toBe(false);
    expect(fulfilled.winner).toBeNull();
  });

  it("prevents the attack phase and turn end until the required move is made", () => {
    const required = applyStartOfTurnRules(engagementState("4,4", "4,7"));

    expect(gameReducer(required, { type: "setPhase", phase: "attack" })).toBe(
      required
    );
    expect(gameReducer(required, { type: "endTurn" })).toBe(required);
  });

  it("awards Austria victory when no qualifying move is possible", () => {
    const blocked = engagementState("0,9", "8,9");
    blocked.units[0].status = "disordered";

    const result = applyStartOfTurnRules(blocked);
    expect(result.winner).toBe("austrian");
    expect(result.prussianEngagementRequired).toBe(false);
  });

  it("does not apply when the option is disabled", () => {
    const state = engagementState("0,9", "8,9");
    state.options = { prussianMustEngage: false };

    const result = applyStartOfTurnRules(state);
    expect(result.prussianEngagementRequired).toBe(false);
    expect(result.winner).toBeNull();
  });
});

describe("historical deployment", () => {
  it("places all 28 units on matching printed troop symbols", () => {
    const units = createHistoricalUnits(() => 0.42);
    expect(units).toHaveLength(28);
    expect(new Set(units.map((unit) => unit.hexId)).size).toBe(28);

    const allowedSlots = (unit: Unit): readonly HexId[] => {
      if (unit.side === "prussian") {
        if (unit.kind === "infantry" || unit.kind === "grenadier") {
          return HISTORICAL_DEPLOYMENT.prussian.infantry;
        }
        if (unit.kind === "cavalry") {
          return HISTORICAL_DEPLOYMENT.prussian.cavalry;
        }
        return HISTORICAL_DEPLOYMENT.prussian.artillery;
      }

      if (unit.kind === "infantry" || unit.kind === "grenadier") {
        return HISTORICAL_DEPLOYMENT.austrian.infantry;
      }
      if (unit.kind === "lightInfantry") {
        return HISTORICAL_DEPLOYMENT.austrian.lightInfantry;
      }
      if (unit.kind === "cavalry") {
        return HISTORICAL_DEPLOYMENT.austrian.cavalry;
      }
      if (unit.kind === "lightCavalry") {
        return HISTORICAL_DEPLOYMENT.austrian.lightCavalry;
      }
      return HISTORICAL_DEPLOYMENT.austrian.artillery;
    };

    for (const deployedUnit of units) {
      expect(deployedUnit.hexId).not.toBeNull();
      expect(allowedSlots(deployedUnit)).toContain(deployedUnit.hexId);
    }
  });

  it("randomizes grenadiers among ordinary infantry symbols", () => {
    const lowRoll = createHistoricalUnits(() => 0);
    const highRoll = createHistoricalUnits(() => 0.999999);
    const grenadierHexes = (units: Unit[], side: Unit["side"]) =>
      units
        .filter((unit) => unit.side === side && unit.kind === "grenadier")
        .map((unit) => unit.hexId)
        .sort();

    expect(grenadierHexes(lowRoll, "prussian")).not.toEqual(
      grenadierHexes(highRoll, "prussian")
    );
    expect(grenadierHexes(lowRoll, "austrian")).not.toEqual(
      grenadierHexes(highRoll, "austrian")
    );
  });

  it("randomizes the high-mobility Prussian cavalry among cavalry symbols", () => {
    const lowRoll = createHistoricalUnits(() => 0);
    const highRoll = createHistoricalUnits(() => 0.999999);
    const prussianCavalry = (units: Unit[]) =>
      units.filter(
        (unit) => unit.side === "prussian" && unit.kind === "cavalry"
      );
    const fastCavalry = (units: Unit[]) =>
      prussianCavalry(units).filter((unit) => unit.stats.movement === 4);

    expect(fastCavalry(lowRoll)).toHaveLength(1);
    expect(fastCavalry(highRoll)).toHaveLength(1);
    expect(HISTORICAL_DEPLOYMENT.prussian.cavalry).toContain(
      fastCavalry(lowRoll)[0].hexId
    );
    expect(fastCavalry(lowRoll)[0].hexId).not.toBe(
      fastCavalry(highRoll)[0].hexId
    );
    expect(
      prussianCavalry(lowRoll).filter((unit) => unit.stats.movement === 3)
    ).toHaveLength(3);
  });
});

describe("saved games", () => {
  it("restores a complete mid-game state even after the current game ended", () => {
    const current: GameState = {
      ...createInitialState(() => 0),
      winner: "prussian"
    };
    const saved: GameState = {
      ...createInitialState(() => 0.999999),
      turn: 4,
      activeSide: "austrian",
      phase: "attack",
      movedThisTurn: ["A-I-1"],
      attackedThisTurn: ["A-C-1"],
      winner: null
    };

    const restored = gameReducer(current, { type: "load", state: saved });

    expect(restored).toBe(saved);
    expect(restored.turn).toBe(4);
    expect(restored.activeSide).toBe("austrian");
    expect(restored.phase).toBe("attack");
    expect(restored.movedThisTurn).toEqual(["A-I-1"]);
    expect(restored.attackedThisTurn).toEqual(["A-C-1"]);
  });
});

describe("movement", () => {
  it("never allows a unit to enter an Elbe hex", () => {
    const state = createInitialState();
    const movedState: GameState = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "P-I-1"
          ? { ...unit, hexId: "5,0" as HexId, stats: { ...unit.stats, movement: 2 } }
          : { ...unit, hexId: null }
      )
    };

    expect(getLegalMoves(movedState, "P-I-1").has("6,0")).toBe(false);
  });

  it("records a legal move and prevents the same unit moving twice", () => {
    const state = createInitialState();
    const legal = getLegalMoves(state, "P-I-1");
    const destination = [...legal][0];
    expect(destination).toBeDefined();

    const moved = gameReducer(state, {
      type: "move",
      unitId: "P-I-1",
      destination
    });
    expect(moved.movedThisTurn).toContain("P-I-1");
    expect(getLegalMoves(moved, "P-I-1").size).toBe(0);
  });

  it("stops a unit immediately after it crosses an elevation line", () => {
    const state = createInitialState();
    const isolated: GameState = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "P-I-1"
          ? {
              ...unit,
              hexId: "0,7" as HexId,
              stats: { ...unit.stats, movement: 3 }
            }
          : { ...unit, hexId: null }
      )
    };

    const legal = getLegalMoves(isolated, "P-I-1");
    expect(crossesElevationLine("0,7", "0,8")).toBe(true);
    expect(legal.has("0,8")).toBe(true);
    expect(legal.has("0,9")).toBe(false);
  });

  it("allows continued movement when no elevation line is crossed", () => {
    const state = createInitialState();
    const isolated: GameState = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "P-I-1"
          ? {
              ...unit,
              hexId: "4,5" as HexId,
              stats: { ...unit.stats, movement: 2 }
            }
          : { ...unit, hexId: null }
      )
    };

    expect(crossesElevationLine("4,5", "4,6")).toBe(false);
    expect(getLegalMoves(isolated, "P-I-1").has("4,7")).toBe(true);
  });

  it("continues across the little river when entering its bridge along the road", () => {
    const state = createInitialState();
    const isolated: GameState = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "P-I-1"
          ? {
              ...unit,
              hexId: "7,5" as HexId,
              stats: { ...unit.stats, movement: 2 }
            }
          : { ...unit, hexId: null }
      )
    };

    const legal = getLegalMoves(isolated, "P-I-1");
    expect(legal.has("7,6")).toBe(true);
    expect(legal.has("7,7")).toBe(true);
  });

  it("stops after entering a marsh hex away from the bridge", () => {
    const state = createInitialState();
    const isolated: GameState = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "P-I-1"
          ? {
              ...unit,
              hexId: "4,6" as HexId,
              stats: { ...unit.stats, movement: 2 }
            }
          : { ...unit, hexId: null }
      )
    };

    const legal = getLegalMoves(isolated, "P-I-1");
    expect(legal.has("4,7")).toBe(true);
    expect(legal.has("4,8")).toBe(false);
  });
});

describe("elevation-line digitization", () => {
  it("maps the four printed elevation lines to 47 adjacent hex edges", () => {
    expect(ELEVATION_LINE_COUNT).toBe(4);
    expect(ELEVATION_EDGES.size).toBe(47);

    for (const edge of ELEVATION_EDGES) {
      const [first, second] = edge.split("|") as [HexId, HexId];
      const cell = BOARD_BY_ID.get(first);
      expect(cell).toBeDefined();
      expect(BOARD_BY_ID.has(second)).toBe(true);
      expect(getNeighborIds(cell!, BOARD_BY_ID)).toContain(second);
    }
  });
});

describe("line of sight", () => {
  const artillery = piece(
    "P-A",
    "prussian",
    "artillery",
    "2,5",
    { attack: 3, range: 4, movement: 1, defense: 4 }
  );
  const target = piece(
    "A-I",
    "austrian",
    "infantry",
    "2,9",
    { attack: 2, range: 2, movement: 2, defense: 6 }
  );

  it("is clear when all intermediate hexes are clear", () => {
    const result = getLineOfSight(isolatedState([artillery, target]), "P-A", "A-I");
    expect(result.distance).toBe(4);
    expect(result.visible).toBe(true);
    expect(result.reason).toBe("clear");
  });

  it("is blocked by an intervening unit", () => {
    const blocker = piece(
      "P-I",
      "prussian",
      "infantry",
      "2,7",
      { attack: 2, range: 2, movement: 2, defense: 6 }
    );
    const result = getLineOfSight(
      isolatedState([artillery, blocker, target]),
      "P-A",
      "A-I"
    );
    expect(result.visible).toBe(false);
    expect(result.blockers).toContain("2,7");
    expect(result.reason).toBe("unit");
  });

  it("does not let target terrain block its own hex", () => {
    const townTarget = { ...target, hexId: "3,9" as HexId };
    const clearAttacker = { ...artillery, hexId: "3,5" as HexId };
    const result = getLineOfSight(
      isolatedState([clearAttacker, townTarget]),
      "P-A",
      "A-I"
    );
    expect(result.inRange).toBe(true);
    expect(result.visible).toBe(true);
  });
});

describe("combat sequence", () => {
  it("prevents ranged fire after the attacker moved", () => {
    const state = isolatedState([
      piece("P-A", "prussian", "artillery", "4,5", {
        attack: 3,
        range: 4,
        movement: 1,
        defense: 4
      }),
      piece("A-I", "austrian", "infantry", "4,7", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    state.movedThisTurn = ["P-A"];
    expect(validateAttack(state, "P-A", "A-I").key).toBe("attack.movedRanged");
  });

  it("allows cavalry to attack from the bridge hex but not from other marsh hexes", () => {
    const bridgeState = isolatedState([
      piece("P-C", "prussian", "cavalry", "7,6", {
        attack: 3,
        range: 1,
        movement: 3,
        defense: 5
      }),
      piece("A-I", "austrian", "infantry", "8,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    expect(validateAttack(bridgeState, "P-C", "A-I").legal).toBe(true);

    const marshState = isolatedState([
      piece("P-C", "prussian", "cavalry", "6,6", {
        attack: 3,
        range: 1,
        movement: 3,
        defense: 5
      }),
      piece("A-I", "austrian", "infantry", "7,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    expect(validateAttack(marshState, "P-C", "A-I").key).toBe(
      "attack.cavalryTerrain"
    );
  });

  it("eliminates a defender on a result two above defense", () => {
    const state = isolatedState([
      piece("P-G", "prussian", "grenadier", "4,5", {
        attack: 4,
        range: 2,
        movement: 2,
        defense: 7
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    const result = resolveAttack(state, "P-G", "A-I", 6);
    expect(result?.outcome).toBe("eliminated");
    expect(result?.state.units.find((unit) => unit.id === "A-I")?.hexId).toBeNull();
  });

  it("adds the uphill defense bonus when an elevation line is crossed", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,1", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "3,2", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);

    expect(crossesElevationLine("4,1", "3,2")).toBe(true);
    const result = resolveAttack(state, "P-I", "A-I", 1);
    expect(result?.defenseTotal).toBe(7);
    expect(result).toMatchObject({
      attackFactor: 2,
      attackTotal: 3,
      defenseBase: 6,
      defenseTerrainBonus: 0,
      defenseFieldworksBonus: 0,
      defenseElevationBonus: 1,
      outcome: "noEffect",
      outcomeReason: "noEffect"
    });
  });

  it("adds +1 defense in the confirmed Austrian fieldworks", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "6,4", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "7,4", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);

    const result = resolveAttack(state, "P-I", "A-I", 1);
    expect(BOARD_BY_ID.get("7,4")?.fieldworks).toBe(true);
    expect(result?.defenseTotal).toBe(7);
    expect(result).toMatchObject({
      defenseBase: 6,
      defenseTerrainBonus: 0,
      defenseFieldworksBonus: 1,
      defenseElevationBonus: 0
    });
  });

  it("does not eliminate an already disordered defender when attack misses", () => {
    const defender = piece("A-I", "austrian", "infantry", "4,6", {
      attack: 2,
      range: 2,
      movement: 2,
      defense: 6
    });
    defender.status = "disordered";
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      defender
    ]);

    const result = resolveAttack(state, "P-I", "A-I", 1);
    expect(result?.attackTotal).toBe(3);
    expect(result?.defenseTotal).toBe(6);
    expect(result?.outcome).toBe("noEffect");
    expect(result?.state.units.find((unit) => unit.id === "A-I")?.hexId).toBe(
      "4,6"
    );
  });

  it("adds two legal attackers to one die roll and uses both attack slots", () => {
    const state = isolatedState([
      piece("P-I-1", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("P-I-2", "prussian", "infantry", "5,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);

    const validation = validateCombinedAttack(
      state,
      ["P-I-1", "P-I-2"],
      "A-I"
    );
    expect(validation.legal).toBe(true);
    expect(validation.attackFactor).toBe(4);
    expect(validation.lineOfSights).toHaveLength(2);

    const result = resolveAttack(state, ["P-I-1", "P-I-2"], "A-I", 2)!;
    expect(result.attackFactor).toBe(4);
    expect(result.attackTotal).toBe(6);
    expect(result.state.attackedThisTurn).toEqual(["P-I-1", "P-I-2"]);
    expect(result.outcome).toBe("pendingRetreat");
    expect(result.state.pendingRetreat?.destinations.length).toBeGreaterThan(1);

    const retreat = resolveRetreatChoice(
      result.state,
      result.state.pendingRetreat!.destinations[0]
    )!;
    expect(retreat.outcome).toBe("retreated");
    expect(retreat.state.pendingPursuit).toEqual({
      destination: "4,6",
      eligibleUnitIds: ["P-I-1", "P-I-2"]
    });
  });

  it("requires an open-ground defender to choose one legal retreat hex", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);

    const result = resolveAttack(state, "P-I", "A-I", 4)!;
    expect(result.outcome).toBe("pendingRetreat");
    expect(result.state.pendingRetreat?.mayHold).toBe(false);
    expect(result.state.pendingRetreat?.destinations.length).toBeGreaterThan(1);
    expect(resolveRetreatChoice(result.state, null)).toBeNull();

    const destination = result.state.pendingRetreat!.destinations.at(-1)!;
    const retreat = resolveRetreatChoice(result.state, destination)!;
    expect(retreat.retreatHex).toBe(destination);
    expect(
      retreat.state.units.find((unit) => unit.id === "A-I")
    ).toMatchObject({ hexId: destination, status: "disordered" });
  });

  it("lets defeated town and woods defenders choose to hold or retreat", () => {
    const cases: Array<{ defenderHex: HexId; attackerHex: HexId }> = [
      { defenderHex: "5,6", attackerHex: "4,5" },
      { defenderHex: "3,1", attackerHex: "4,1" }
    ];

    for (const { defenderHex, attackerHex } of cases) {
      const state = isolatedState([
        piece("P-I", "prussian", "infantry", attackerHex, {
          attack: 2,
          range: 2,
          movement: 2,
          defense: 6
        }),
        piece("A-I", "austrian", "infantry", defenderHex, {
          attack: 2,
          range: 2,
          movement: 2,
          defense: 0
        })
      ]);
      const result = resolveAttack(state, "P-I", "A-I", 1)!;

      expect(result.outcome).toBe("pendingRetreat");
      expect(result.state.pendingRetreat?.mayHold).toBe(true);
      expect(result.state.pendingRetreat?.destinations.length).toBeGreaterThan(0);

      const held = resolveRetreatChoice(result.state, null)!;
      expect(held.outcome).toBe("disordered");
      expect(held.state.pendingPursuit).toBeNull();
      expect(held.state.units.find((unit) => unit.id === "A-I")).toMatchObject({
        hexId: defenderHex,
        status: "disordered"
      });

      const destination = result.state.pendingRetreat!.destinations[0];
      const retreated = resolveRetreatChoice(result.state, destination)!;
      expect(retreated.outcome).toBe("retreated");
      expect(
        retreated.state.units.find((unit) => unit.id === "A-I")?.hexId
      ).toBe(destination);
    }
  });

  it("offers pursuit only to adjacent attackers with movement greater than one", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("P-A", "prussian", "artillery", "5,6", {
        attack: 3,
        range: 4,
        movement: 1,
        defense: 4
      }),
      piece("P-FAR", "prussian", "infantry", "4,4", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);

    expect(
      getPursuitCandidates(state, ["P-I", "P-A", "P-FAR"], "4,6")
    ).toEqual(["P-I"]);
  });

  it("does not offer pursuit to an attacker in an enemy zone of control", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-C", "austrian", "cavalry", "3,5", {
        attack: 3,
        range: 1,
        movement: 3,
        defense: 5
      })
    ]);

    expect(getPursuitCandidates(state, ["P-I"], "4,6")).toEqual([]);
  });

  it("moves the chosen attacker into the abandoned hex and can also skip", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    const result = resolveAttack(state, "P-I", "A-I", 6)!;

    expect(result.outcome).toBe("eliminated");
    expect(result.state.pendingPursuit).toEqual({
      destination: "4,6",
      eligibleUnitIds: ["P-I"]
    });

    const pursued = gameReducer(result.state, { type: "pursue", unitId: "P-I" });
    expect(pursued.units.find((unit) => unit.id === "P-I")?.hexId).toBe("4,6");
    expect(pursued.pendingPursuit).toBeNull();

    const skipped = gameReducer(result.state, { type: "pursue", unitId: null });
    expect(skipped.units.find((unit) => unit.id === "P-I")?.hexId).toBe("4,5");
    expect(skipped.pendingPursuit).toBeNull();
  });

  it("blocks other game actions until pursuit is resolved", () => {
    const state = isolatedState([
      piece("P-I", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    const result = resolveAttack(state, "P-I", "A-I", 6)!;

    expect(gameReducer(result.state, { type: "endTurn" })).toBe(result.state);
    expect(
      gameReducer(result.state, { type: "setPhase", phase: "move" })
    ).toBe(result.state);
  });

  it("recovers only the current player's disordered units at the end of his turn", () => {
    const prussian = piece("P-I", "prussian", "infantry", "0,9", {
      attack: 2,
      range: 2,
      movement: 2,
      defense: 6
    });
    const austrian = piece("A-I", "austrian", "infantry", "8,9", {
      attack: 2,
      range: 2,
      movement: 2,
      defense: 6
    });
    prussian.status = "disordered";
    austrian.status = "disordered";
    const state = isolatedState([prussian, austrian]);

    const ended = gameReducer(state, { type: "endTurn" });
    expect(ended.units.find((unit) => unit.id === "P-I")?.status).toBe("active");
    expect(ended.units.find((unit) => unit.id === "A-I")?.status).toBe(
      "disordered"
    );
  });

  it("keeps disordered units flipped when their hex is in an enemy zone of control", () => {
    const prussian = piece("P-I", "prussian", "infantry", "4,5", {
      attack: 2,
      range: 2,
      movement: 2,
      defense: 6
    });
    const austrian = piece("A-I", "austrian", "infantry", "5,5", {
      attack: 2,
      range: 2,
      movement: 2,
      defense: 6
    });
    prussian.status = "disordered";
    const state = isolatedState([prussian, austrian]);

    const ended = gameReducer(state, { type: "endTurn" });
    expect(ended.units.find((unit) => unit.id === "P-I")?.status).toBe(
      "disordered"
    );
  });

  it("rejects a combined attack when either attacker cannot reach the target", () => {
    const state = isolatedState([
      piece("P-I-1", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("P-I-2", "prussian", "infantry", "0,9", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);

    const validation = validateCombinedAttack(
      state,
      ["P-I-1", "P-I-2"],
      "A-I"
    );
    expect(validation.legal).toBe(false);
    expect(validation.key).toBe("attack.outOfRange");
  });

  it("rejects two attackers when only one attack slot remains", () => {
    const state = isolatedState([
      piece("P-I-1", "prussian", "infantry", "4,5", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("P-I-2", "prussian", "infantry", "5,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      }),
      piece("A-I", "austrian", "infantry", "4,6", {
        attack: 2,
        range: 2,
        movement: 2,
        defense: 6
      })
    ]);
    state.attackedThisTurn = ["P-A"];

    const finalSingleAttack = validateCombinedAttack(state, ["P-I-1"], "A-I");
    expect(finalSingleAttack.legal).toBe(true);
    expect(finalSingleAttack.key).toBe("attack.ready.lastSlot");

    const validation = validateCombinedAttack(
      state,
      ["P-I-1", "P-I-2"],
      "A-I"
    );
    expect(validation.legal).toBe(false);
    expect(validation.key).toBe("attack.limit");
  });
});
