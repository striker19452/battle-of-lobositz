import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDeploymentState,
  deploymentComplete,
  deploymentPlacementsRemaining,
  getDeploymentLegalHexes,
  isDeploymentSelectable,
  placeDeploymentUnit,
  undoDeployment,
  type DeploymentState
} from "../game/setup";
import type {
  GameOptions,
  HexId,
  Locale,
  SetupMode,
  Unit
} from "../game/types";
import { translate } from "../i18n";
import { GameBoard } from "./GameBoard";
import { GameGuide } from "./GameGuide";

interface SetupDialogProps {
  locale: Locale;
  canCancel: boolean;
  onCancel: () => void;
  onLocaleToggle: () => void;
  onStart: (
    mode: SetupMode,
    units: Unit[] | undefined,
    options: GameOptions
  ) => void;
}

const MODES: SetupMode[] = ["random", "historical", "free"];

export function SetupDialog({
  locale,
  canCancel,
  onCancel,
  onLocaleToggle,
  onStart
}: SetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedMode, setSelectedMode] = useState<SetupMode>("random");
  const [prussianMustEngage, setPrussianMustEngage] = useState(true);
  const [deployment, setDeployment] = useState<DeploymentState | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const legalHexes = useMemo(
    () =>
      deployment && selectedUnitId
        ? getDeploymentLegalHexes(deployment, selectedUnitId)
        : new Set<HexId>(),
    [deployment, selectedUnitId]
  );

  function begin() {
    if (selectedMode === "random") {
      onStart("random", undefined, { prussianMustEngage });
      return;
    }
    setDeployment(createDeploymentState(selectedMode));
    setSelectedUnitId(null);
  }

  function activateSetupHex(hexId: HexId) {
    if (!deployment) return;
    const occupyingUnit = deployment.units.find((unit) => unit.hexId === hexId);
    if (occupyingUnit && isDeploymentSelectable(deployment, occupyingUnit)) {
      setSelectedUnitId(occupyingUnit.id);
      return;
    }
    if (!selectedUnitId || !legalHexes.has(hexId)) return;
    setDeployment(placeDeploymentUnit(deployment, selectedUnitId, hexId));
    setSelectedUnitId(null);
  }

  function startManualGame() {
    if (!deployment || !deploymentComplete(deployment)) return;
    onStart(deployment.mode, deployment.units, { prussianMustEngage });
  }

  const selectedUnit = deployment?.units.find(
    (unit) => unit.id === selectedUnitId
  );
  const activeRemaining = deployment?.units.filter(
    (unit) => isDeploymentSelectable(deployment, unit) && unit.hexId === null
  );

  return (
    <dialog
      ref={dialogRef}
      className="setup-dialog"
      aria-labelledby="setup-title"
      onCancel={(event) => {
        event.preventDefault();
        if (canCancel) onCancel();
      }}
    >
      {!deployment ? (
        <div className="setup-mode-view">
          <header className="setup-dialog__header">
            <div>
              <span>{translate(locale, "setup.eyebrow")}</span>
              <h2 id="setup-title">{translate(locale, "setup.title")}</h2>
            </div>
            <div className="setup-dialog__header-actions">
              <button type="button" onClick={onLocaleToggle}>
                {translate(locale, "app.locale")}
              </button>
              {canCancel && (
                <button type="button" onClick={onCancel}>
                  {translate(locale, "setup.cancel")}
                </button>
              )}
            </div>
          </header>

          <p className="setup-mode-view__intro">
            {translate(locale, "setup.intro")}
          </p>

          <GameGuide
            locale={locale}
            placement="setup"
            initiallyOpen
          />

          <div className="setup-mode-list" role="radiogroup">
            {MODES.map((mode, index) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selectedMode === mode}
                className={selectedMode === mode ? "is-selected" : ""}
                onClick={() => setSelectedMode(mode)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{translate(locale, `setup.mode.${mode}`)}</strong>
                <small>{translate(locale, `setup.mode.${mode}.description`)}</small>
              </button>
            ))}
          </div>

          <section
            className="setup-rules"
            aria-labelledby="setup-rules-title"
          >
            <h3 id="setup-rules-title">
              {translate(locale, "setup.rules")}
            </h3>
            <label>
              <input
                type="checkbox"
                checked={prussianMustEngage}
                onChange={(event) =>
                  setPrussianMustEngage(event.currentTarget.checked)
                }
              />
              <span>
                <strong>
                  {translate(locale, "setup.rule.prussianEngagement")}
                </strong>
                <small>
                  {translate(
                    locale,
                    "setup.rule.prussianEngagement.description"
                  )}
                </small>
              </span>
            </label>
          </section>

          <footer className="setup-mode-view__footer">
            <p>{translate(locale, `setup.mode.${selectedMode}.rule`)}</p>
            <button type="button" onClick={begin}>
              {translate(
                locale,
                selectedMode === "random"
                  ? "setup.startRandom"
                  : "setup.beginPlacement"
              )}
            </button>
          </footer>
        </div>
      ) : (
        <div className="setup-deployment-view">
          <header className="setup-dialog__header setup-deployment-view__header">
            <div>
              <span>{translate(locale, "setup.eyebrow")}</span>
              <h2 id="setup-title">
                {translate(locale, `setup.mode.${deployment.mode}`)}
              </h2>
            </div>
            <div className="setup-dialog__header-actions">
              <button type="button" onClick={onLocaleToggle}>
                {translate(locale, "app.locale")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeployment(null);
                  setSelectedUnitId(null);
                }}
              >
                {translate(locale, "setup.back")}
              </button>
            </div>
          </header>

          <section className="setup-deployment-status" aria-live="polite">
            <div>
              <i
                className={`side-mark side-mark--${deployment.activeSide}`}
                aria-hidden="true"
              />
              <strong>
                {translate(locale, "setup.activeSide", {
                  side: translate(locale, `side.${deployment.activeSide}`)
                })}
              </strong>
              <span>
                {translate(locale, `setup.instruction.${deployment.mode}`)}
              </span>
            </div>
            <div className="setup-deployment-status__counts">
              {(["austrian", "prussian"] as const).map((side) => (
                <span key={side}>
                  {translate(locale, `side.${side}`)} {" "}
                  <b>
                    {deployment.units.filter(
                      (unit) => unit.side === side && unit.hexId !== null
                    ).length}
                    /14
                  </b>
                </span>
              ))}
            </div>
          </section>

          <div className="setup-workspace">
            <GameBoard
              locale={locale}
              units={deployment.units}
              activeSide={deployment.activeSide}
              movedUnitIds={[]}
              attackedUnitIds={[]}
              selectedUnitIds={selectedUnitId ? [selectedUnitId] : []}
              targetUnitId={null}
              inspectedHexId={selectedUnit?.hexId ?? null}
              legalMoves={legalHexes}
              lineOfSights={[]}
              retreatOrigin={null}
              retreatDestinations={[]}
              selectedRetreatDestination={null}
              pursuitDestination={null}
              pursuitUnitIds={[]}
              selectedPursuitUnitId={null}
              helpText={translate(locale, "setup.boardHelp")}
              onHexActivate={activateSetupHex}
            />

            <aside className="setup-roster">
              <div className="setup-roster__heading">
                <div>
                  <span>{translate(locale, "setup.remaining")}</span>
                  <strong>
                    {translate(locale, `side.${deployment.activeSide}`)}
                  </strong>
                </div>
                <b>{activeRemaining?.length ?? 0}</b>
              </div>

              {selectedUnit && (
                <p className="setup-roster__selection">
                  {translate(locale, "setup.selected", {
                    unit: translate(locale, `unit.${selectedUnit.kind}`)
                  })}
                </p>
              )}

              <div className="setup-roster__units">
                {activeRemaining?.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    className={selectedUnitId === unit.id ? "is-selected" : ""}
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <span>
                      <strong>{translate(locale, `unit.${unit.kind}`)}</strong>
                      <small>{unit.id}</small>
                    </span>
                    <span className="setup-roster__stats">
                      <b>{translate(locale, "stat.attack")} {unit.stats.attack}</b>
                      <b>{translate(locale, "stat.range")} {unit.stats.range}</b>
                      <b>{translate(locale, "stat.move")} {unit.stats.movement}</b>
                      <b>{translate(locale, "stat.defense")} {unit.stats.defense}</b>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <footer className="setup-deployment-actions">
            <button
              type="button"
              disabled={deployment.placementOrder.length === 0}
              onClick={() => {
                setDeployment(undoDeployment(deployment));
                setSelectedUnitId(null);
              }}
            >
              {translate(locale, "setup.undo")}
            </button>
            <span>
              {deploymentComplete(deployment)
                ? translate(locale, "setup.ready")
                : translate(locale, "setup.incomplete", {
                    remaining: deploymentPlacementsRemaining(deployment)
                  })}
            </span>
            <button
              type="button"
              disabled={!deploymentComplete(deployment)}
              onClick={startManualGame}
            >
              {translate(locale, "setup.startGame")}
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
