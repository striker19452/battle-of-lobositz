import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  CombatResult,
  type CombatReport
} from "./components/CombatResult";
import { DiceRoll, type DiceRollState } from "./components/DiceRoll";
import { GameBoard } from "./components/GameBoard";
import { GameGuide } from "./components/GameGuide";
import { PursuitPanel } from "./components/PursuitPanel";
import { RetreatPanel } from "./components/RetreatPanel";
import { SetupDialog } from "./components/SetupDialog";
import { VictoryPanel } from "./components/VictoryPanel";
import { getNeighborIds } from "./game/hex";
import { BOARD_BY_ID } from "./game/scenario";
import {
  applyStartOfTurnRules,
  gameReducer,
  getLegalMoves,
  getUnit,
  getUnitAt,
  resolveAttack,
  resolveRetreatChoice,
  validateCombinedAttack
} from "./game/rules";
import {
  createInitialState,
  createInitialStateFromUnits
} from "./game/scenario";
import { crossesElevationLine } from "./game/terrainEdges";
import type {
  GameOptions,
  GameState,
  HexId,
  Locale,
  SetupMode,
  Side,
  Unit
} from "./game/types";
import { translate } from "./i18n";

const SAVE_KEY = "lobositz-game-v2";
const MANUAL_SAVE_KEY = "lobositz-manual-save-v1";

interface ManualSave {
  version: 1;
  savedAt: string;
  state: GameState;
}

type SaveNotice = "saved" | "loaded" | "invalid" | "failed" | null;

function localizedSide(locale: Locale, side: Side): string {
  return translate(locale, `side.${side}`);
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return (
    Number.isInteger(candidate.turn) &&
    (candidate.activeSide === "prussian" || candidate.activeSide === "austrian") &&
    (candidate.phase === "move" || candidate.phase === "attack") &&
    Array.isArray(candidate.units) &&
    candidate.units.length === 28 &&
    Array.isArray(candidate.movedThisTurn) &&
    Array.isArray(candidate.attackedThisTurn) &&
    Array.isArray(candidate.log) &&
    (candidate.winner === null ||
      candidate.winner === "prussian" ||
      candidate.winner === "austrian")
  );
}

function normalizeGameState(state: GameState): GameState {
  return {
    ...state,
    setupMode:
      state.setupMode === "historical" || state.setupMode === "free"
        ? state.setupMode
        : "random",
    options: {
      prussianMustEngage: state.options?.prussianMustEngage ?? true
    },
    prussianEngagementRequired: state.prussianEngagementRequired ?? false,
    pendingRetreat: state.pendingRetreat ?? null,
    pendingPursuit: state.pendingPursuit ?? null
  };
}

function readAutoSavedState(): GameState | null {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    return isGameState(parsed) ? normalizeGameState(parsed) : null;
  } catch {
    return null;
  }
}

function loadSavedState(): GameState {
  return readAutoSavedState() ?? createInitialState();
}

function readManualSave(): ManualSave | null {
  try {
    const saved = localStorage.getItem(MANUAL_SAVE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<ManualSave>;
    if (
      parsed.version !== 1 ||
      typeof parsed.savedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.savedAt)) ||
      !isGameState(parsed.state)
    ) {
      return null;
    }
    return {
      version: 1,
      savedAt: parsed.savedAt,
      state: normalizeGameState(parsed.state)
    };
  } catch {
    return null;
  }
}

function UnitSummary({ unit, locale }: { unit: Unit; locale: Locale }) {
  return (
    <div className="unit-summary">
      <div>
        <span className={`side-mark side-mark--${unit.side}`} aria-hidden="true" />
        <strong>{translate(locale, `unit.${unit.kind}`)}</strong>
        <span>{unit.id}</span>
      </div>
      <div className="stat-row" aria-label={translate(locale, `unit.${unit.kind}`)}>
        {(
          [
            ["attack", unit.stats.attack],
            ["range", unit.stats.range],
            ["move", unit.stats.movement],
            ["defense", unit.stats.defense]
          ] as const
        ).map(([key, value]) => (
          <span key={key}>
            <small>{translate(locale, `stat.${key}`)}</small>
            <b>{value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadSavedState);
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem("lobositz-locale") === "en" ? "en" : "zh-CN"
  );
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null);
  const [inspectedHexId, setInspectedHexId] = useState<HexId | null>(null);
  const [endTurnArmed, setEndTurnArmed] = useState(false);
  const [diceRoll, setDiceRoll] = useState<DiceRollState | null>(null);
  const [combatReport, setCombatReport] = useState<CombatReport | null>(null);
  const [retreatDestination, setRetreatDestination] = useState<HexId | null>(null);
  const [pursuitUnitId, setPursuitUnitId] = useState<string | null>(null);
  const [manualSave, setManualSave] = useState<ManualSave | null>(readManualSave);
  const [saveNotice, setSaveNotice] = useState<SaveNotice>(null);
  const [loadArmed, setLoadArmed] = useState(false);
  const [victoryVisible, setVictoryVisible] = useState(Boolean(state.winner));
  const [setupFlow, setSetupFlow] = useState<
    "required" | "optional" | null
  >(() => (readAutoSavedState() ? null : "required"));
  const endTurnTimer = useRef<number | null>(null);
  const diceTimer = useRef<number | null>(null);
  const loadTimer = useRef<number | null>(null);
  const diceRef = useRef<HTMLDivElement | null>(null);
  const combatResultRef = useRef<HTMLDivElement | null>(null);
  const retreatRef = useRef<HTMLDivElement | null>(null);
  const pursuitRef = useRef<HTMLDivElement | null>(null);
  const unitInfoRef = useRef<HTMLElement | null>(null);
  const rulingRef = useRef<HTMLElement | null>(null);
  const terrainRef = useRef<HTMLElement | null>(null);
  const isRolling = diceRoll?.phase === "rolling";
  const pendingRetreat = state.pendingRetreat;
  const pendingPursuit = state.pendingPursuit;
  const decisionPending = Boolean(pendingRetreat || pendingPursuit);
  const retreatKey = pendingRetreat
    ? `${pendingRetreat.defenderId}:${pendingRetreat.destinations.join(",")}`
    : "";
  const pursuitKey = pendingPursuit
    ? `${pendingPursuit.destination}:${pendingPursuit.eligibleUnitIds.join(",")}`
    : "";

  useEffect(() => {
    localStorage.setItem("lobositz-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (setupFlow === "required") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }, [setupFlow, state]);

  useEffect(() => {
    if (state.winner) setVictoryVisible(true);
  }, [state.winner]);

  useEffect(() => {
    setSelectedUnitIds([]);
    setTargetUnitId(null);
    setEndTurnArmed(false);
    setDiceRoll(null);
    setCombatReport(null);
    setLoadArmed(false);
  }, [state.activeSide, state.turn]);

  useEffect(() => {
    if (!pendingRetreat) {
      setRetreatDestination(null);
      return;
    }
    setSelectedUnitIds([]);
    setTargetUnitId(null);
    setRetreatDestination(
      pendingRetreat.destinations.length === 1
        ? pendingRetreat.destinations[0]
        : null
    );
    const frame = window.requestAnimationFrame(() => {
      retreatRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [retreatKey]);

  useEffect(() => {
    if (!pendingPursuit) {
      setPursuitUnitId(null);
      return;
    }
    setSelectedUnitIds([]);
    setTargetUnitId(null);
    setPursuitUnitId(
      pendingPursuit.eligibleUnitIds.length === 1
        ? pendingPursuit.eligibleUnitIds[0]
        : null
    );
    const frame = window.requestAnimationFrame(() => {
      pursuitRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pursuitKey]);

  useEffect(
    () => () => {
      if (endTurnTimer.current) window.clearTimeout(endTurnTimer.current);
      if (diceTimer.current) window.clearTimeout(diceTimer.current);
      if (loadTimer.current) window.clearTimeout(loadTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!targetUnitId || selectedUnitIds.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      rulingRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedUnitIds.length, targetUnitId]);

  useEffect(() => {
    if (diceRoll?.phase !== "rolling") return;
    const frame = window.requestAnimationFrame(() => {
      diceRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [diceRoll?.phase]);

  useEffect(() => {
    if (!combatReport) return;
    const frame = window.requestAnimationFrame(() => {
      combatResultRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto"
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [combatReport]);

  useEffect(() => {
    if (!inspectedHexId || diceRoll || combatReport) return;
    const occupyingUnit = getUnitAt(state, inspectedHexId);
    if (
      !occupyingUnit ||
      (targetUnitId !== null && selectedUnitIds.length > 0)
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      unitInfoRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [combatReport, diceRoll, inspectedHexId, selectedUnitIds.length, state, targetUnitId]);

  useEffect(() => {
    if (
      !inspectedHexId ||
      diceRoll !== null ||
      combatReport !== null ||
      getUnitAt(state, inspectedHexId) !== undefined ||
      (targetUnitId !== null && selectedUnitIds.length > 0)
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      terrainRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [combatReport, diceRoll, inspectedHexId, selectedUnitIds.length, state, targetUnitId]);

  const selectedUnits = selectedUnitIds
    .map((id) => getUnit(state, id))
    .filter((unit): unit is Unit => unit !== undefined);
  const selectedUnit = selectedUnits[0];
  const targetUnit = targetUnitId ? getUnit(state, targetUnitId) : undefined;
  const inspectedHex = inspectedHexId
    ? BOARD_BY_ID.get(inspectedHexId)
    : undefined;
  const inspectedUnit = inspectedHexId
    ? getUnitAt(state, inspectedHexId)
    : undefined;
  const pursuitCandidates = pendingPursuit
    ? pendingPursuit.eligibleUnitIds
        .map((id) => getUnit(state, id))
        .filter((unit): unit is Unit => unit !== undefined)
    : [];
  const retreatingDefender = pendingRetreat
    ? getUnit(state, pendingRetreat.defenderId)
    : undefined;
  const terrainDetails = useMemo(() => {
    if (!inspectedHex) return [];
    const details: Array<{
      id: string;
      label: string;
      description: string;
    }> = inspectedHex.terrain.map((terrain) => ({
      id: terrain,
      label: translate(locale, `terrain.${terrain}`),
      description: translate(locale, `terrain.detail.${terrain}`)
    }));
    if (inspectedHex.road) {
      details.push({
        id: "road",
        label: translate(locale, "terrain.road"),
        description: translate(locale, "terrain.detail.road")
      });
    }
    if (inspectedHex.bridge) {
      details.push({
        id: "bridge",
        label: translate(locale, "terrain.bridge"),
        description: translate(locale, "terrain.detail.bridge")
      });
    }
    if (inspectedHex.fieldworks) {
      details.push({
        id: "fieldworks",
        label: translate(locale, "terrain.fieldworks"),
        description: translate(locale, "terrain.detail.fieldworks")
      });
    }
    const elevationEdges = getNeighborIds(inspectedHex, BOARD_BY_ID).filter(
      (neighborId) => crossesElevationLine(inspectedHex.id, neighborId)
    ).length;
    if (elevationEdges > 0) {
      details.push({
        id: "elevation",
        label: translate(locale, "terrain.elevationLine"),
        description: translate(locale, "terrain.detail.elevationLine", {
          count: elevationEdges
        })
      });
    }
    if (inspectedHex.victory) {
      details.push({
        id: "objective",
        label: translate(locale, "terrain.objective"),
        description: translate(locale, "terrain.detail.objective")
      });
    }
    return details;
  }, [inspectedHex, locale]);
  const legalMoves = useMemo(
    () =>
      selectedUnitIds[0]
        ? getLegalMoves(state, selectedUnitIds[0])
        : new Set<HexId>(),
    [selectedUnitIds, state]
  );
  const attackValidation = useMemo(
    () =>
      selectedUnitIds.length > 0 && targetUnitId
        ? validateCombinedAttack(state, selectedUnitIds, targetUnitId)
        : null,
    [selectedUnitIds, state, targetUnitId]
  );

  function activateHex(hexId: HexId) {
    setInspectedHexId(hexId);
    if (isRolling || state.winner) return;
    const occupyingUnit = getUnitAt(state, hexId);

    if (pendingRetreat) {
      if (pendingRetreat.destinations.includes(hexId)) {
        setRetreatDestination(hexId);
      }
      return;
    }

    if (pendingPursuit) {
      if (
        occupyingUnit &&
        pendingPursuit.eligibleUnitIds.includes(occupyingUnit.id)
      ) {
        setPursuitUnitId(occupyingUnit.id);
      }
      return;
    }

    if (occupyingUnit?.side === state.activeSide) {
      if (state.phase === "move") {
        setSelectedUnitIds((current) =>
          current[0] === occupyingUnit.id ? [] : [occupyingUnit.id]
        );
        setTargetUnitId(null);
      } else {
        setSelectedUnitIds((current) => {
          if (current.includes(occupyingUnit.id)) {
            return current.filter((id) => id !== occupyingUnit.id);
          }
          if (current.length < 2) return [...current, occupyingUnit.id];
          return [current[0], occupyingUnit.id];
        });
      }
      return;
    }

    if (!selectedUnit) {
      setTargetUnitId(occupyingUnit?.id ?? null);
      return;
    }

    if (state.phase === "move" && legalMoves.has(hexId)) {
      dispatch({ type: "move", unitId: selectedUnit.id, destination: hexId });
      setTargetUnitId(null);
      return;
    }

    if (state.phase === "attack" && occupyingUnit?.side !== state.activeSide) {
      setTargetUnitId(occupyingUnit?.id ?? null);
      return;
    }

    setTargetUnitId(null);
  }

  function performAttack() {
    if (
      isRolling ||
      decisionPending ||
      selectedUnitIds.length === 0 ||
      !targetUnitId ||
      !attackValidation?.legal
    ) {
      return;
    }
    const attackerIds = [...selectedUnitIds];
    const defenderId = targetUnitId;
    const die = Math.floor(Math.random() * 6) + 1;
    const resolution = resolveAttack(state, attackerIds, defenderId, die);
    if (!resolution) return;
    const rollDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 120
      : 900;
    setCombatReport(null);
    setDiceRoll({ phase: "rolling", value: die });
    if (diceTimer.current) window.clearTimeout(diceTimer.current);
    diceTimer.current = window.setTimeout(() => {
      dispatch({
        type: "attack",
        attackerIds,
        defenderId,
        die
      });
      setDiceRoll({ phase: "result", value: die });
      setCombatReport({ attackerIds, defenderId, resolution });
      setSelectedUnitIds([]);
      setTargetUnitId(null);
      diceTimer.current = null;
    }, rollDuration);
  }

  function armOrEndTurn() {
    if (
      isRolling ||
      decisionPending ||
      state.winner ||
      state.prussianEngagementRequired
    ) return;
    if (!endTurnArmed) {
      setEndTurnArmed(true);
      if (endTurnTimer.current) window.clearTimeout(endTurnTimer.current);
      endTurnTimer.current = window.setTimeout(() => setEndTurnArmed(false), 3500);
      return;
    }
    if (endTurnTimer.current) window.clearTimeout(endTurnTimer.current);
    setDiceRoll(null);
    setCombatReport(null);
    dispatch({ type: "endTurn" });
  }

  function clearTransientUi() {
    setSelectedUnitIds([]);
    setTargetUnitId(null);
    setInspectedHexId(null);
    setEndTurnArmed(false);
    setDiceRoll(null);
    setCombatReport(null);
  }

  function startNewGame(
    mode: SetupMode,
    units: Unit[] | undefined,
    options: GameOptions
  ) {
    if (mode !== "random" && units?.length !== 28) return;
    const initialState =
      mode === "random"
        ? createInitialState(Math.random, options)
        : createInitialStateFromUnits(units ?? [], mode, options);
    const nextState = applyStartOfTurnRules(initialState);
    dispatch({ type: "load", state: nextState });
    clearTransientUi();
    setVictoryVisible(false);
    setSetupFlow(null);
  }

  function openNewGameSetup() {
    setVictoryVisible(false);
    setSetupFlow("optional");
  }

  function chooseRetreat(destination: HexId | null) {
    if (!pendingRetreat) return;
    const choice = resolveRetreatChoice(state, destination);
    if (!choice) return;
    dispatch({ type: "retreat", destination });
    setCombatReport((current) =>
      current
        ? {
            ...current,
            resolution: {
              ...current.resolution,
              state: choice.state,
              outcome: choice.outcome,
              outcomeReason: choice.outcomeReason,
              retreatHex: choice.retreatHex
            }
          }
        : current
    );
    setInspectedHexId(destination ?? pendingRetreat.origin);
  }

  function confirmRetreat() {
    if (!retreatDestination) return;
    chooseRetreat(retreatDestination);
  }

  function confirmPursuit() {
    if (!pendingPursuit || !pursuitUnitId) return;
    dispatch({ type: "pursue", unitId: pursuitUnitId });
    setInspectedHexId(pendingPursuit.destination);
  }

  function skipPursuit() {
    if (!pendingPursuit) return;
    dispatch({ type: "pursue", unitId: null });
  }

  function saveCurrentGame() {
    if (isRolling) return;
    const savedGame: ManualSave = {
      version: 1,
      savedAt: new Date().toISOString(),
      state
    };
    try {
      localStorage.setItem(MANUAL_SAVE_KEY, JSON.stringify(savedGame));
      setManualSave(savedGame);
      setSaveNotice("saved");
      setLoadArmed(false);
      if (loadTimer.current) window.clearTimeout(loadTimer.current);
    } catch {
      setSaveNotice("failed");
    }
  }

  function armOrLoadGame() {
    if (isRolling || !manualSave) return;
    if (!loadArmed) {
      setLoadArmed(true);
      setSaveNotice(null);
      if (loadTimer.current) window.clearTimeout(loadTimer.current);
      loadTimer.current = window.setTimeout(() => {
        setLoadArmed(false);
        loadTimer.current = null;
      }, 3500);
      return;
    }

    if (loadTimer.current) window.clearTimeout(loadTimer.current);
    loadTimer.current = null;
    const savedGame = readManualSave();
    if (!savedGame) {
      setManualSave(null);
      setSaveNotice("invalid");
      setLoadArmed(false);
      return;
    }

    dispatch({ type: "load", state: savedGame.state });
    setSelectedUnitIds([]);
    setTargetUnitId(null);
    setEndTurnArmed(false);
    setDiceRoll(null);
    setCombatReport(null);
    setManualSave(savedGame);
    setSaveNotice("loaded");
    setLoadArmed(false);
  }

  const manualSaveTime = manualSave
    ? new Intl.DateTimeFormat(locale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(manualSave.savedAt))
    : null;

  const rulingText = attackValidation
    ? translate(locale, attackValidation.key, {
        attack: attackValidation.attackFactor,
        distance: Math.max(
          ...attackValidation.lineOfSights.map((lineOfSight) => lineOfSight.distance)
        )
      })
    : selectedUnit && state.phase === "move"
      ? locale === "zh-CN"
        ? `可到达 ${legalMoves.size} 个格子。`
        : `${legalMoves.size} legal destination${legalMoves.size === 1 ? "" : "s"}.`
      : null;

  return (
    <div className="app-shell">
      <header className="command-bar">
        <div className="title-lockup">
          <span className="title-lockup__kicker">{translate(locale, "app.subtitle")}</span>
          <h1>{translate(locale, "app.title")}</h1>
        </div>
        <div
          className={`turn-readout ${state.winner ? "is-victory" : ""}`}
          aria-live={state.winner ? "assertive" : "polite"}
        >
          <strong>
            {state.winner
              ? translate(locale, "turn.winner", {
                  side: localizedSide(locale, state.winner)
                })
              : translate(locale, "turn.label", { turn: state.turn })}
          </strong>
          {state.winner ? (
            <button type="button" onClick={() => setVictoryVisible(true)}>
              {translate(locale, "victory.reopen")}
            </button>
          ) : (
            <span>
              <i className={`side-mark side-mark--${state.activeSide}`} />
              {translate(locale, "turn.active", {
                side: localizedSide(locale, state.activeSide)
              })}
            </span>
          )}
        </div>
        <button
          type="button"
          className="language-button"
          onClick={() => setLocale((current) => (current === "en" ? "zh-CN" : "en"))}
          aria-label={translate(locale, "app.localeLabel")}
        >
          {translate(locale, "app.locale")}
        </button>
      </header>

      <main className="game-layout">
        <div
          className={`battlefield-column ${
            state.prussianEngagementRequired ? "has-engagement-rule" : ""
          }`}
        >
          <nav className="phase-bar" aria-label={translate(locale, "panel.rules")}>
            <div className="phase-switch">
              {(["move", "attack"] as const).map((phase) => (
                <button
                  key={phase}
                  type="button"
                  className={state.phase === phase ? "is-active" : ""}
                  disabled={
                    isRolling ||
                    decisionPending ||
                    Boolean(state.winner) ||
                    (phase === "attack" &&
                      state.prussianEngagementRequired) ||
                    (phase === "move" && state.attackedThisTurn.length > 0)
                  }
                  onClick={() => {
                    dispatch({ type: "setPhase", phase });
                    setSelectedUnitIds([]);
                    setTargetUnitId(null);
                    setDiceRoll(null);
                    setCombatReport(null);
                  }}
                >
                  <span>{phase === "move" ? "01" : "02"}</span>
                  {translate(locale, `phase.${phase}`)}
                  <small>
                    {phase === "move"
                      ? `${state.movedThisTurn.length}/3`
                      : `${state.attackedThisTurn.length}/2`}
                  </small>
                </button>
              ))}
            </div>
            <div className="usage-counters">
              <span>{translate(locale, "counter.moves", { used: state.movedThisTurn.length })}</span>
              <span>{translate(locale, "counter.attacks", { used: state.attackedThisTurn.length })}</span>
            </div>
            <button
              type="button"
              className={`end-turn-button ${endTurnArmed ? "is-armed" : ""}`}
              disabled={
                isRolling ||
                decisionPending ||
                Boolean(state.winner) ||
                state.prussianEngagementRequired
              }
              onClick={armOrEndTurn}
            >
              {translate(locale, endTurnArmed ? "turn.confirm" : "turn.end")}
            </button>
          </nav>

          {state.prussianEngagementRequired && (
            <div
              className="engagement-rule-notice"
              role="alert"
              aria-live="assertive"
            >
              <strong>{translate(locale, "engagement.required.title")}</strong>
              <span>{translate(locale, "engagement.required.body")}</span>
            </div>
          )}

          <GameBoard
            locale={locale}
            units={state.units}
            activeSide={state.activeSide}
            selectedUnitIds={selectedUnitIds}
            targetUnitId={targetUnitId}
            inspectedHexId={inspectedHexId}
            legalMoves={legalMoves}
            lineOfSights={attackValidation?.lineOfSights ?? []}
            retreatOrigin={pendingRetreat?.origin ?? null}
            retreatDestinations={pendingRetreat?.destinations ?? []}
            selectedRetreatDestination={retreatDestination}
            pursuitDestination={pendingPursuit?.destination ?? null}
            pursuitUnitIds={pendingPursuit?.eligibleUnitIds ?? []}
            selectedPursuitUnitId={pursuitUnitId}
            onHexActivate={activateHex}
          />
        </div>

        <aside className="inspector">
          <div className="inspector__eyebrow">
            <span>{translate(locale, "app.prototype")}</span>
            <span>v0.1</span>
          </div>

          <GameGuide locale={locale} placement="sidebar" />

          {diceRoll && (
            <div ref={diceRef} className="dice-roll-anchor">
              <DiceRoll locale={locale} roll={diceRoll} />
              {combatReport && (
                <div ref={combatResultRef} className="combat-result-anchor">
                  <CombatResult locale={locale} report={combatReport} />
                </div>
              )}
            </div>
          )}

          {pendingRetreat && retreatingDefender && (
            <div ref={retreatRef} className="retreat-panel-anchor">
              <RetreatPanel
                locale={locale}
                defender={retreatingDefender}
                origin={pendingRetreat.origin}
                destinations={pendingRetreat.destinations}
                mayHold={pendingRetreat.mayHold}
                selectedDestination={retreatDestination}
                onSelect={setRetreatDestination}
                onConfirm={confirmRetreat}
                onHold={() => chooseRetreat(null)}
              />
            </div>
          )}

          {pendingPursuit && (
            <div ref={pursuitRef} className="pursuit-panel-anchor">
              <PursuitPanel
                locale={locale}
                destination={pendingPursuit.destination}
                candidates={pursuitCandidates}
                selectedUnitId={pursuitUnitId}
                onSelect={setPursuitUnitId}
                onConfirm={confirmPursuit}
                onSkip={skipPursuit}
              />
            </div>
          )}

          {selectedUnit ? (
            <>
              <section ref={unitInfoRef} className="selection-section">
                <div className="selection-section__heading">
                  <h2>
                    {translate(
                      locale,
                      state.phase === "attack"
                        ? "panel.primaryAttacker"
                        : "panel.selected"
                    )}
                  </h2>
                  {state.phase === "attack" && (
                    <button
                      type="button"
                      disabled={isRolling}
                      onClick={() =>
                        setSelectedUnitIds((current) =>
                          current.filter((id) => id !== selectedUnit.id)
                        )
                      }
                    >
                      {translate(locale, "panel.removeAttacker")}
                    </button>
                  )}
                </div>
                <UnitSummary unit={selectedUnit} locale={locale} />
                {selectedUnit.hexId && (
                  <p className="terrain-line">
                    {BOARD_BY_ID.get(selectedUnit.hexId)?.terrain
                      .map((terrain) => translate(locale, `terrain.${terrain}`))
                      .join(" · ")}
                  </p>
                )}
              </section>

              {selectedUnits[1] && (
                <section className="selection-section selection-section--supporting">
                  <div className="selection-section__heading">
                    <h2>{translate(locale, "panel.supportingAttacker")}</h2>
                    <button
                      type="button"
                      disabled={isRolling}
                      onClick={() =>
                        setSelectedUnitIds((current) =>
                          current.filter((id) => id !== selectedUnits[1].id)
                        )
                      }
                    >
                      {translate(locale, "panel.removeAttacker")}
                    </button>
                  </div>
                  <UnitSummary unit={selectedUnits[1]} locale={locale} />
                </section>
              )}

              {targetUnit && (
                <section className="selection-section selection-section--target">
                  <h2>{translate(locale, "panel.target")}</h2>
                  <UnitSummary unit={targetUnit} locale={locale} />
                </section>
              )}

              <section
                ref={rulingRef}
                className={`ruling ${attackValidation?.legal ? "is-legal" : ""}`}
              >
                <h2>{translate(locale, "panel.rules")}</h2>
                <p>{rulingText}</p>
                {targetUnit && (
                  <button
                    type="button"
                    className="attack-button"
                    disabled={!attackValidation?.legal || isRolling}
                    onClick={performAttack}
                  >
                    {isRolling
                      ? translate(locale, "dice.rolling")
                      : translate(
                          locale,
                          attackValidation?.legal
                            ? selectedUnits.length === 2
                              ? "panel.combinedAttack"
                              : "panel.attack"
                            : "panel.attackUnavailable",
                          { attack: attackValidation?.attackFactor ?? 0 }
                        )}
                  </button>
                )}
              </section>
            </>
          ) : inspectedUnit ? (
            <section
              ref={unitInfoRef}
              className="selection-section unit-inspection"
            >
              <h2>{translate(locale, "panel.unitInfo")}</h2>
              <UnitSummary unit={inspectedUnit} locale={locale} />
              <p className="unit-inspection__context">
                {localizedSide(locale, inspectedUnit.side)}
                <span aria-hidden="true"> · </span>
                {translate(locale, `status.${inspectedUnit.status}`)}
              </p>
              {inspectedUnit.hexId && (
                <p className="terrain-line">
                  {BOARD_BY_ID.get(inspectedUnit.hexId)?.terrain
                    .map((terrain) => translate(locale, `terrain.${terrain}`))
                    .join(" · ")}
                </p>
              )}
            </section>
          ) : (
            <section className="empty-selection">
              <div className="empty-selection__hex" aria-hidden="true">⌬</div>
              <h2>{translate(locale, "panel.noSelection")}</h2>
              <p>{translate(locale, "panel.noSelectionBody")}</p>
            </section>
          )}

          {inspectedHex && (
            <section
              ref={terrainRef}
              className="terrain-inspector"
              aria-labelledby="terrain-inspector-title"
              aria-live="polite"
            >
              <div className="terrain-inspector__heading">
                <h2 id="terrain-inspector-title">
                  {translate(locale, "panel.terrain")}
                </h2>
                <span>
                  {translate(locale, "terrain.hex", { id: inspectedHex.id })}
                </span>
              </div>
              <dl>
                {terrainDetails.map((detail) => (
                  <div key={detail.id}>
                    <dt>
                      <i className={`terrain-swatch terrain-swatch--${detail.id}`} />
                      {detail.label}
                    </dt>
                    <dd>{detail.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="save-panel" aria-labelledby="save-panel-title">
            <div className="save-panel__heading">
              <div>
                <h2 id="save-panel-title">{translate(locale, "save.title")}</h2>
                <span>{translate(locale, "save.auto")}</span>
              </div>
              <time dateTime={manualSave?.savedAt}>
                {manualSaveTime
                  ? translate(locale, "save.savedAt", { time: manualSaveTime })
                  : translate(locale, "save.empty")}
              </time>
            </div>
            <div className="save-panel__actions">
              <button type="button" disabled={isRolling} onClick={saveCurrentGame}>
                {translate(locale, "save.action")}
              </button>
              <button
                type="button"
                className={loadArmed ? "is-armed" : ""}
                disabled={isRolling || !manualSave}
                onClick={armOrLoadGame}
              >
                {translate(
                  locale,
                  loadArmed ? "save.confirmLoad" : "save.load"
                )}
              </button>
              <button
                type="button"
                className="save-panel__new-setup"
                disabled={isRolling}
                onClick={openNewGameSetup}
              >
                {translate(locale, "panel.reset")}
              </button>
            </div>
            {saveNotice && (
              <p className={`save-panel__notice is-${saveNotice}`} role="status">
                {translate(locale, `save.notice.${saveNotice}`)}
              </p>
            )}
          </section>

          <section className="dispatch-log" aria-live="polite">
            <h2>{translate(locale, "panel.log")}</h2>
            <ol>
              {[...state.log].reverse().slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <i className={`side-mark side-mark--${entry.side ?? state.activeSide}`} />
                  <span>
                    {translate(locale, entry.key, {
                      ...entry.values,
                      side: localizedSide(locale, entry.side ?? state.activeSide)
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <footer className="inspector__footer">
            <p>
              {translate(locale, "panel.scenarioNote", {
                mode: translate(locale, `setup.mode.${state.setupMode}`)
              })}
            </p>
          </footer>
        </aside>
      </main>
      {state.winner && victoryVisible && (
        <VictoryPanel
          locale={locale}
          winner={state.winner}
          onViewBattlefield={() => setVictoryVisible(false)}
          onRestart={openNewGameSetup}
        />
      )}
      {setupFlow && (
        <SetupDialog
          locale={locale}
          canCancel={setupFlow === "optional"}
          onCancel={() => setSetupFlow(null)}
          onLocaleToggle={() =>
            setLocale((current) => (current === "en" ? "zh-CN" : "en"))
          }
          onStart={startNewGame}
        />
      )}
    </div>
  );
}
