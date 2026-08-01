import {
  axialDistance,
  axialLine,
  axialToOffset,
  getNeighborIds,
  toHexId
} from "./hex";
import { BOARD_BY_ID, createInitialState } from "./scenario";
import { crossesElevationLine } from "./terrainEdges";
import type {
  AttackResolution,
  AttackValidation,
  CombinedAttackValidation,
  GameAction,
  GameLogEntry,
  GameState,
  HexCell,
  HexId,
  LineOfSightResult,
  Side,
  Unit
} from "./types";

const STOP_TERRAIN = new Set(["town", "woods", "marsh", "stream"]);
const LOS_TERRAIN = new Set(["town", "woods"]);
const CAVALRY_RESTRICTED_TERRAIN = new Set(["town", "woods", "marsh", "stream"]);

function opposite(side: Side): Side {
  return side === "prussian" ? "austrian" : "prussian";
}

export function getUnit(state: GameState, unitId: string): Unit | undefined {
  return state.units.find((unit) => unit.id === unitId);
}

export function getUnitAt(state: GameState, hexId: HexId): Unit | undefined {
  return state.units.find((unit) => unit.hexId === hexId);
}

export function getEnemyZoc(state: GameState, side: Side): Set<HexId> {
  const zoc = new Set<HexId>();
  state.units
    .filter(
      (unit) =>
        unit.side === opposite(side) && unit.status === "active" && unit.hexId !== null
    )
    .forEach((unit) => {
      const cell = BOARD_BY_ID.get(unit.hexId!);
      if (!cell) return;
      getNeighborIds(cell, BOARD_BY_ID).forEach((id) => zoc.add(id));
    });
  return zoc;
}

function isImpassable(cell: HexCell): boolean {
  return cell.terrain.includes("elbe");
}

function forcesStop(cell: HexCell, previous: HexCell): boolean {
  return cell.terrain.some(
    (terrain) =>
      STOP_TERRAIN.has(terrain) &&
      !(terrain === "stream" && cell.bridge && previous.road)
  );
}

export function getLegalMoves(state: GameState, unitId: string): Set<HexId> {
  const piece = getUnit(state, unitId);
  const legal = new Set<HexId>();
  if (
    !piece ||
    !piece.hexId ||
    piece.side !== state.activeSide ||
    piece.status !== "active" ||
    state.phase !== "move" ||
    state.movedThisTurn.includes(piece.id) ||
    state.movedThisTurn.length >= 3
  ) {
    return legal;
  }

  const enemyZoc = getEnemyZoc(state, piece.side);
  const occupied = new Map(
    state.units
      .filter((unit) => unit.hexId !== null)
      .map((unit) => [unit.hexId as HexId, unit])
  );
  const origin = piece.hexId;
  const originInZoc = enemyZoc.has(origin);
  const queue: Array<{ id: HexId; distance: number }> = [{ id: origin, distance: 0 }];
  const bestDistance = new Map<HexId, number>([[origin, 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.distance >= piece.stats.movement) continue;
    const cell = BOARD_BY_ID.get(current.id);
    if (!cell) continue;

    for (const neighborId of getNeighborIds(cell, BOARD_BY_ID)) {
      const destination = BOARD_BY_ID.get(neighborId)!;
      const nextDistance = current.distance + 1;
      const occupyingUnit = occupied.get(neighborId);
      const destinationInZoc = enemyZoc.has(neighborId);

      if (isImpassable(destination)) continue;
      if (occupyingUnit?.side !== undefined && occupyingUnit.side !== piece.side) continue;
      if (originInZoc && destinationInZoc) continue;

      if (!occupyingUnit) legal.add(neighborId);

      const mustStop =
        forcesStop(destination, cell) ||
        crossesElevationLine(current.id, neighborId) ||
        destinationInZoc ||
        nextDistance >= piece.stats.movement;
      if (mustStop) continue;

      const previousDistance = bestDistance.get(neighborId);
      if (previousDistance === undefined || nextDistance < previousDistance) {
        bestDistance.set(neighborId, nextDistance);
        queue.push({ id: neighborId, distance: nextDistance });
      }
    }
  }

  return legal;
}

function axialPathToHexIds(start: HexCell, end: HexCell, sign: 1 | -1): HexId[] {
  return axialLine(start.axial, end.axial, sign)
    .map(axialToOffset)
    .map(({ col, row }) => toHexId(col, row))
    .filter((id) => BOARD_BY_ID.has(id));
}

function blockersForPath(
  state: GameState,
  path: HexId[]
): { terrain: HexId[]; units: HexId[] } {
  const intermediate = path.slice(1, -1);
  return {
    terrain: intermediate.filter((id) =>
      BOARD_BY_ID.get(id)?.terrain.some((terrain) => LOS_TERRAIN.has(terrain))
    ),
    units: intermediate.filter((id) => getUnitAt(state, id) !== undefined)
  };
}

export function getLineOfSight(
  state: GameState,
  attackerId: string,
  defenderId: string
): LineOfSightResult {
  const attacker = getUnit(state, attackerId);
  const defender = getUnit(state, defenderId);
  if (!attacker?.hexId || !defender?.hexId) {
    return {
      inRange: false,
      visible: false,
      distance: 0,
      chosenPath: [],
      alternatePath: [],
      blockers: [],
      reason: "outOfRange"
    };
  }

  const start = BOARD_BY_ID.get(attacker.hexId)!;
  const end = BOARD_BY_ID.get(defender.hexId)!;
  const distance = axialDistance(start.axial, end.axial);
  const primary = axialPathToHexIds(start, end, 1);
  const alternate = axialPathToHexIds(start, end, -1);
  const inRange = distance <= attacker.stats.range;

  if (!inRange) {
    return {
      inRange,
      visible: false,
      distance,
      chosenPath: primary,
      alternatePath: alternate,
      blockers: [],
      reason: "outOfRange"
    };
  }

  const primaryBlockers = blockersForPath(state, primary);
  const alternateBlockers = blockersForPath(state, alternate);
  const primaryBlocked =
    primaryBlockers.terrain.length > 0 || primaryBlockers.units.length > 0;
  const alternateBlocked =
    alternateBlockers.terrain.length > 0 || alternateBlockers.units.length > 0;
  const visible = !primaryBlocked || !alternateBlocked;
  const selected = !primaryBlocked ? primary : !alternateBlocked ? alternate : primary;
  const blockedByTerrain = [
    ...new Set([...primaryBlockers.terrain, ...alternateBlockers.terrain])
  ];
  const blockedByUnits = [
    ...new Set([...primaryBlockers.units, ...alternateBlockers.units])
  ];
  const blockers = [...new Set([...blockedByTerrain, ...blockedByUnits])];
  const reason =
    visible
      ? "clear"
      : blockedByTerrain.length > 0 && blockedByUnits.length > 0
        ? "terrainAndUnit"
        : blockedByUnits.length > 0
          ? "unit"
          : "terrain";

  return {
    inRange,
    visible,
    distance,
    chosenPath: selected,
    alternatePath: selected === primary ? alternate : primary,
    blockers,
    reason
  };
}

export function validateAttack(
  state: GameState,
  attackerId: string,
  defenderId: string
): AttackValidation {
  const lineOfSight = getLineOfSight(state, attackerId, defenderId);
  const attacker = getUnit(state, attackerId);
  const defender = getUnit(state, defenderId);

  if (!attacker || !defender || !attacker.hexId || !defender.hexId) {
    return { legal: false, key: "attack.missingUnit", lineOfSight };
  }
  if (state.phase !== "attack") {
    return { legal: false, key: "attack.wrongPhase", lineOfSight };
  }
  if (attacker.side !== state.activeSide || defender.side === state.activeSide) {
    return { legal: false, key: "attack.wrongSide", lineOfSight };
  }
  if (attacker.status !== "active") {
    return { legal: false, key: "attack.disordered", lineOfSight };
  }
  if (
    state.attackedThisTurn.includes(attacker.id) ||
    state.attackedThisTurn.length >= 2
  ) {
    return { legal: false, key: "attack.limit", lineOfSight };
  }
  if (attacker.stats.range > 1 && state.movedThisTurn.includes(attacker.id)) {
    return { legal: false, key: "attack.movedRanged", lineOfSight };
  }

  const attackerCell = BOARD_BY_ID.get(attacker.hexId)!;
  if (
    (attacker.kind === "cavalry" || attacker.kind === "lightCavalry") &&
    attackerCell.terrain.some((terrain) => CAVALRY_RESTRICTED_TERRAIN.has(terrain))
  ) {
    return { legal: false, key: "attack.cavalryTerrain", lineOfSight };
  }

  const enemyZoc = getEnemyZoc(state, attacker.side);
  if (
    enemyZoc.has(attacker.hexId) &&
    (lineOfSight.distance !== 1 || defender.status !== "active")
  ) {
    return { legal: false, key: "attack.zocRestriction", lineOfSight };
  }
  if (!lineOfSight.inRange) {
    return { legal: false, key: "attack.outOfRange", lineOfSight };
  }
  if (!lineOfSight.visible) {
    return { legal: false, key: `attack.blocked.${lineOfSight.reason}`, lineOfSight };
  }
  return { legal: true, key: "attack.ready", lineOfSight };
}

export function validateCombinedAttack(
  state: GameState,
  attackerIds: string[],
  defenderId: string
): CombinedAttackValidation {
  const uniqueAttackerIds = [...new Set(attackerIds)];
  const attackers = uniqueAttackerIds
    .map((id) => getUnit(state, id))
    .filter((unit): unit is Unit => unit !== undefined);
  const lineOfSights = uniqueAttackerIds.map((id) =>
    getLineOfSight(state, id, defenderId)
  );
  const attackFactor = attackers.reduce(
    (total, attacker) => total + attacker.stats.attack,
    0
  );

  if (attackerIds.length === 0) {
    return {
      legal: false,
      key: "attack.missingUnit",
      lineOfSights,
      attackFactor
    };
  }
  if (uniqueAttackerIds.length !== attackerIds.length) {
    return {
      legal: false,
      key: "attack.combined.duplicate",
      lineOfSights,
      attackFactor
    };
  }
  if (attackerIds.length > 2) {
    return {
      legal: false,
      key: "attack.combined.tooMany",
      lineOfSights,
      attackFactor
    };
  }
  if (state.attackedThisTurn.length + attackerIds.length > 2) {
    return {
      legal: false,
      key: "attack.limit",
      lineOfSights,
      attackFactor
    };
  }

  const validations = uniqueAttackerIds.map((id) =>
    validateAttack(state, id, defenderId)
  );
  const invalid = validations.find((validation) => !validation.legal);
  if (invalid) {
    return {
      legal: false,
      key: invalid.key,
      lineOfSights,
      attackFactor
    };
  }

  return {
    legal: true,
    key:
      attackerIds.length === 2
        ? "attack.ready.combined"
        : state.attackedThisTurn.length === 1
          ? "attack.ready.lastSlot"
          : "attack.ready",
    lineOfSights,
    attackFactor
  };
}

function attackedUphill(
  attacker: Unit,
  defender: Unit,
  lineOfSight: LineOfSightResult
): boolean {
  if (!attacker.hexId || !defender.hexId) return false;
  const attackerCell = BOARD_BY_ID.get(attacker.hexId);
  const defenderCell = BOARD_BY_ID.get(defender.hexId);
  if (
    !attackerCell ||
    !defenderCell ||
    defenderCell.elevationLevel <= attackerCell.elevationLevel
  ) {
    return false;
  }
  return lineOfSight.chosenPath.some(
    (hexId, index, path) =>
      index > 0 && crossesElevationLine(path[index - 1], hexId)
  );
}

function defenseBreakdown(
  cell: HexCell,
  defender: Unit,
  elevationBonus: boolean
): {
  base: number;
  terrain: number;
  fieldworks: number;
  elevation: number;
  total: number;
} {
  const base = defender.stats.defense;
  const terrain = cell.terrain.some((kind) => LOS_TERRAIN.has(kind)) ? 2 : 0;
  const fieldworks = cell.fieldworks ? 1 : 0;
  const elevation = elevationBonus ? 1 : 0;
  return {
    base,
    terrain,
    fieldworks,
    elevation,
    total: base + terrain + fieldworks + elevation
  };
}

function appendLog(
  state: GameState,
  key: string,
  values?: Record<string, string | number>,
  side = state.activeSide
): GameLogEntry[] {
  const id = (state.log.at(-1)?.id ?? 0) + 1;
  return [...state.log, { id, key, values, side }].slice(-12);
}

function unitHasEnemyWithinAttackRange(unit: Unit, units: Unit[]): boolean {
  if (!unit.hexId) return false;
  const unitCell = BOARD_BY_ID.get(unit.hexId);
  if (!unitCell) return false;

  return units.some((enemy) => {
    if (enemy.side === unit.side || !enemy.hexId) return false;
    const enemyCell = BOARD_BY_ID.get(enemy.hexId);
    return Boolean(
      enemyCell &&
        axialDistance(unitCell.axial, enemyCell.axial) <= unit.stats.range
    );
  });
}

function prussianEngagementSatisfied(units: Unit[]): boolean {
  return units.some(
    (unit) =>
      unit.side === "prussian" &&
      unitHasEnemyWithinAttackRange(unit, units)
  );
}

function canFulfillPrussianEngagement(state: GameState): boolean {
  return state.units.some((unit) => {
    if (unit.side !== "prussian" || !unit.hexId) return false;
    return [...getLegalMoves(state, unit.id)].some((destination) => {
      const movedUnits = state.units.map((candidate) =>
        candidate.id === unit.id
          ? { ...candidate, hexId: destination }
          : candidate
      );
      return unitHasEnemyWithinAttackRange(
        movedUnits.find((candidate) => candidate.id === unit.id)!,
        movedUnits
      );
    });
  });
}

export function applyStartOfTurnRules(state: GameState): GameState {
  if (
    state.winner ||
    state.activeSide !== "prussian" ||
    !state.options.prussianMustEngage ||
    prussianEngagementSatisfied(state.units)
  ) {
    return { ...state, prussianEngagementRequired: false };
  }

  const requiredState = {
    ...state,
    prussianEngagementRequired: true
  };

  if (canFulfillPrussianEngagement(requiredState)) {
    return {
      ...requiredState,
      log: appendLog(
        requiredState,
        "log.prussianEngagementRequired",
        undefined,
        "prussian"
      )
    };
  }

  return {
    ...requiredState,
    prussianEngagementRequired: false,
    winner: "austrian",
    log: appendLog(
      requiredState,
      "log.austrianEngagementVictory",
      undefined,
      "austrian"
    )
  };
}

function legalRetreats(
  state: GameState,
  defender: Unit,
  attacker: Unit
): HexId[] {
  if (!defender.hexId || !attacker.hexId) return [];
  const defenderCell = BOARD_BY_ID.get(defender.hexId)!;
  const attackerCell = BOARD_BY_ID.get(attacker.hexId)!;
  const currentDistance = axialDistance(defenderCell.axial, attackerCell.axial);
  const enemyZoc = getEnemyZoc(state, defender.side);

  return getNeighborIds(defenderCell, BOARD_BY_ID)
    .filter((id) => !getUnitAt(state, id))
    .filter((id) => !isImpassable(BOARD_BY_ID.get(id)!))
    .filter((id) => !enemyZoc.has(id))
    .filter(
      (id) =>
        axialDistance(BOARD_BY_ID.get(id)!.axial, attackerCell.axial) > currentDistance
    );
}

export function getPursuitCandidates(
  state: GameState,
  attackerIds: string[],
  abandonedHex: HexId
): string[] {
  const destination = BOARD_BY_ID.get(abandonedHex);
  if (!destination || getUnitAt(state, abandonedHex)) return [];
  const adjacentHexes = new Set(getNeighborIds(destination, BOARD_BY_ID));
  const enemyZoc = getEnemyZoc(state, state.activeSide);

  return [...new Set(attackerIds)].filter((unitId) => {
    const unit = getUnit(state, unitId);
    return Boolean(
      unit?.hexId &&
        unit.side === state.activeSide &&
        unit.status === "active" &&
        unit.stats.movement > 1 &&
        adjacentHexes.has(unit.hexId) &&
        !enemyZoc.has(unit.hexId)
    );
  });
}

export function resolveAttack(
  state: GameState,
  attackerIds: string | string[],
  defenderId: string,
  die = Math.floor(Math.random() * 6) + 1
): AttackResolution | null {
  const normalizedAttackerIds = Array.isArray(attackerIds)
    ? attackerIds
    : [attackerIds];
  const validation = validateCombinedAttack(
    state,
    normalizedAttackerIds,
    defenderId
  );
  if (!validation.legal) return null;
  const attackers = normalizedAttackerIds.map((id) => getUnit(state, id)!);
  const attacker = attackers[0];
  const defender = getUnit(state, defenderId)!;
  const defenderCell = BOARD_BY_ID.get(defender.hexId!)!;
  const attackTotal = validation.attackFactor + die;
  const elevationBonus = attackers.some((unit, index) =>
    attackedUphill(unit, defender, validation.lineOfSights[index])
  );
  const defense = defenseBreakdown(defenderCell, defender, elevationBonus);
  const defenseTotal = defense.total;
  let outcome: AttackResolution["outcome"] = "noEffect";
  let outcomeReason: AttackResolution["outcomeReason"] = "noEffect";
  let retreatHex: HexId | undefined;
  let pendingRetreat: GameState["pendingRetreat"] = null;
  let units = state.units.map((unit) => ({ ...unit }));

  const eliminate = (
    reason: Extract<
      AttackResolution["outcomeReason"],
      "margin" | "alreadyDisordered" | "noRetreat"
    >
  ) => {
    units = units.map((unit) =>
      unit.id === defender.id ? { ...unit, hexId: null } : unit
    );
    outcome = "eliminated";
    outcomeReason = reason;
  };

  if (attackTotal >= defenseTotal + 2) {
    eliminate("margin");
  } else if (attackTotal >= defenseTotal) {
    if (defender.status === "disordered") {
      eliminate("alreadyDisordered");
    } else {
      const mayHold =
        defenderCell.terrain.includes("town") ||
        defenderCell.terrain.includes("woods");
      const retreats = legalRetreats(state, defender, attacker);
      if (!mayHold && retreats.length === 0) {
        eliminate("noRetreat");
      } else {
        units = units.map((unit) =>
          unit.id === defender.id
            ? {
                ...unit,
                status: "disordered",
                hexId: unit.hexId
              }
            : unit
        );
        if (retreats.length > 0) {
          pendingRetreat = {
            defenderId: defender.id,
            attackerIds: normalizedAttackerIds,
            origin: defenderCell.id,
            destinations: retreats,
            mayHold
          };
          outcome = "pendingRetreat";
          outcomeReason = "retreatChoice";
        } else {
          outcome = "disordered";
          outcomeReason = "held";
        }
      }
    }
  }

  const combatState: GameState = {
    ...state,
    units,
    attackedThisTurn: [...state.attackedThisTurn, ...normalizedAttackerIds],
    pendingRetreat,
    pendingPursuit: null,
    log: appendLog(state, `log.attack.${outcome}`, {
      attacker: attackers.map((unit) => unit.id).join(" + "),
      defender: defender.id,
      die,
      attack: attackTotal,
      defense: defenseTotal
    })
  };
  const abandonedHex = defenderCell.id;
  const defenderAfterCombat = units.find((unit) => unit.id === defender.id);
  const pursuitCandidates =
    defenderAfterCombat?.hexId !== abandonedHex
      ? getPursuitCandidates(combatState, normalizedAttackerIds, abandonedHex)
      : [];
  const nextState: GameState = {
    ...combatState,
    pendingPursuit:
      pursuitCandidates.length > 0
        ? { destination: abandonedHex, eligibleUnitIds: pursuitCandidates }
        : null
  };

  return {
    state: nextState,
    die,
    attackFactor: validation.attackFactor,
    attackTotal,
    defenseBase: defense.base,
    defenseTerrainBonus: defense.terrain,
    defenseFieldworksBonus: defense.fieldworks,
    defenseElevationBonus: defense.elevation,
    defenseTotal,
    outcome,
    outcomeReason,
    retreatHex
  };
}

export interface RetreatChoiceResolution {
  state: GameState;
  outcome: "disordered" | "retreated";
  outcomeReason: "held" | "retreat";
  retreatHex?: HexId;
}

export function resolveRetreatChoice(
  state: GameState,
  destination: HexId | null
): RetreatChoiceResolution | null {
  const pending = state.pendingRetreat;
  if (!pending) return null;
  const defender = getUnit(state, pending.defenderId);
  const primaryAttacker = getUnit(state, pending.attackerIds[0]);
  if (
    !defender?.hexId ||
    defender.hexId !== pending.origin ||
    !primaryAttacker?.hexId
  ) {
    return null;
  }

  if (destination === null) {
    if (!pending.mayHold) return null;
    const nextState: GameState = {
      ...state,
      pendingRetreat: null,
      log: appendLog(state, "log.retreatHeld", {
        defender: defender.id,
        origin: pending.origin
      }, defender.side)
    };
    return {
      state: nextState,
      outcome: "disordered",
      outcomeReason: "held"
    };
  }

  const legalDestinations = legalRetreats(state, defender, primaryAttacker);
  if (
    !pending.destinations.includes(destination) ||
    !legalDestinations.includes(destination)
  ) {
    return null;
  }

  const retreatedState: GameState = {
    ...state,
    units: state.units.map((unit) =>
      unit.id === defender.id ? { ...unit, hexId: destination } : unit
    ),
    pendingRetreat: null,
    log: appendLog(state, "log.retreat", {
      defender: defender.id,
      destination
    }, defender.side)
  };
  const pursuitCandidates = getPursuitCandidates(
    retreatedState,
    pending.attackerIds,
    pending.origin
  );
  const nextState: GameState = {
    ...retreatedState,
    pendingPursuit:
      pursuitCandidates.length > 0
        ? { destination: pending.origin, eligibleUnitIds: pursuitCandidates }
        : null
  };
  return {
    state: nextState,
    outcome: "retreated",
    outcomeReason: "retreat",
    retreatHex: destination
  };
}

function recoverUnits(state: GameState): Unit[] {
  const enemyZoc = getEnemyZoc(state, state.activeSide);
  return state.units.map((unit) =>
    unit.side === state.activeSide &&
    unit.status === "disordered" &&
    unit.hexId !== null &&
    !enemyZoc.has(unit.hexId)
      ? { ...unit, status: "active" }
      : unit
  );
}

function prussianVictory(units: Unit[]): boolean {
  return [...BOARD_BY_ID.values()]
    .filter((cell) => cell.victory)
    .every((cell) =>
      units.some(
        (unit) =>
          unit.side === "prussian" &&
          unit.status === "active" &&
          unit.hexId === cell.id
      )
    );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "load") return action.state;
  if (action.type === "reset") return applyStartOfTurnRules(createInitialState());
  if (state.winner) return state;
  if (state.pendingRetreat && action.type !== "retreat") return state;
  if (state.pendingPursuit && action.type !== "pursue") return state;

  switch (action.type) {
    case "setPhase":
      if (action.phase === "move" && state.attackedThisTurn.length > 0) return state;
      if (action.phase === "attack" && state.prussianEngagementRequired) return state;
      return { ...state, phase: action.phase };
    case "move": {
      const legal = getLegalMoves(state, action.unitId);
      if (!legal.has(action.destination)) return state;
      const piece = getUnit(state, action.unitId)!;
      const movedState: GameState = {
        ...state,
        units: state.units.map((unit) =>
          unit.id === piece.id ? { ...unit, hexId: action.destination } : unit
        ),
        movedThisTurn: [...state.movedThisTurn, piece.id],
        log: appendLog(state, "log.move", {
          unit: piece.id,
          destination: action.destination
        })
      };
      if (!state.prussianEngagementRequired) return movedState;

      if (prussianEngagementSatisfied(movedState.units)) {
        return {
          ...movedState,
          prussianEngagementRequired: false,
          log: appendLog(
            movedState,
            "log.prussianEngagementSatisfied",
            undefined,
            "prussian"
          )
        };
      }

      if (canFulfillPrussianEngagement(movedState)) return movedState;

      return {
        ...movedState,
        prussianEngagementRequired: false,
        winner: "austrian",
        log: appendLog(
          movedState,
          "log.austrianEngagementVictory",
          undefined,
          "austrian"
        )
      };
    }
    case "attack": {
      if (state.prussianEngagementRequired) return state;
      const result = resolveAttack(
        state,
        action.attackerIds,
        action.defenderId,
        action.die
      );
      return result?.state ?? state;
    }
    case "retreat": {
      return resolveRetreatChoice(state, action.destination)?.state ?? state;
    }
    case "pursue": {
      const pending = state.pendingPursuit;
      if (!pending) return state;
      if (action.unitId === null) {
        return {
          ...state,
          pendingPursuit: null,
          log: appendLog(state, "log.pursuitSkipped", {
            destination: pending.destination
          })
        };
      }
      const candidates = getPursuitCandidates(
        state,
        pending.eligibleUnitIds,
        pending.destination
      );
      if (!candidates.includes(action.unitId)) return state;
      return {
        ...state,
        units: state.units.map((unit) =>
          unit.id === action.unitId
            ? { ...unit, hexId: pending.destination }
            : unit
        ),
        pendingPursuit: null,
        log: appendLog(state, "log.pursuit", {
          unit: action.unitId,
          destination: pending.destination
        })
      };
    }
    case "endTurn": {
      if (state.prussianEngagementRequired) return state;
      const recoveredUnits = recoverUnits(state);
      const winner =
        state.activeSide === "austrian" && prussianVictory(recoveredUnits)
          ? "prussian"
          : null;
      const nextSide = opposite(state.activeSide);
      const nextState: GameState = {
        ...state,
        activeSide: nextSide,
        turn: state.activeSide === "austrian" ? state.turn + 1 : state.turn,
        phase: "move",
        units: recoveredUnits,
        movedThisTurn: [],
        attackedThisTurn: [],
        pendingRetreat: null,
        pendingPursuit: null,
        winner,
        log: appendLog(
          state,
          winner ? "log.prussianVictory" : "log.turnStart",
          { turn: state.activeSide === "austrian" ? state.turn + 1 : state.turn },
          nextSide
        )
      };
      return winner ? nextState : applyStartOfTurnRules(nextState);
    }
  }
}
