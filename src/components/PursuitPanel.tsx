import type { HexId, Locale, Unit } from "../game/types";
import { translate } from "../i18n";

interface PursuitPanelProps {
  locale: Locale;
  destination: HexId;
  candidates: Unit[];
  selectedUnitId: string | null;
  onSelect: (unitId: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}

export function PursuitPanel({
  locale,
  destination,
  candidates,
  selectedUnitId,
  onSelect,
  onConfirm,
  onSkip
}: PursuitPanelProps) {
  return (
    <section
      className="pursuit-panel"
      aria-labelledby="pursuit-title"
      aria-live="polite"
    >
      <header className="pursuit-panel__heading">
        <div>
          <span>{translate(locale, "pursuit.pending")}</span>
          <h2 id="pursuit-title">{translate(locale, "pursuit.title")}</h2>
        </div>
        <strong>{translate(locale, "pursuit.destination", { hex: destination })}</strong>
      </header>

      <p className="pursuit-panel__rule">
        {translate(locale, "pursuit.rule", { hex: destination })}
      </p>

      <div className="pursuit-panel__candidates" role="group" aria-label={translate(locale, "pursuit.choose")}>
        {candidates.map((unit) => {
          const selected = unit.id === selectedUnitId;
          return (
            <button
              key={unit.id}
              type="button"
              className={selected ? "is-selected" : ""}
              aria-pressed={selected}
              onClick={() => onSelect(unit.id)}
            >
              <span className="pursuit-panel__identity">
                <i className={`side-mark side-mark--${unit.side}`} aria-hidden="true" />
                <span>
                  <strong>{translate(locale, `unit.${unit.kind}`)}</strong>
                  <small>
                    {unit.id} · {unit.hexId} → {destination}
                  </small>
                </span>
              </span>
              <span className="pursuit-panel__movement">
                <small>{translate(locale, "stat.move")}</small>
                <b>{unit.stats.movement}</b>
              </span>
            </button>
          );
        })}
      </div>

      <div className="pursuit-panel__actions">
        <button
          type="button"
          className="pursuit-panel__confirm"
          disabled={!selectedUnitId}
          onClick={onConfirm}
        >
          {translate(
            locale,
            selectedUnitId ? "pursuit.confirm" : "pursuit.chooseFirst"
          )}
        </button>
        <button type="button" className="pursuit-panel__skip" onClick={onSkip}>
          {translate(locale, "pursuit.skip")}
        </button>
      </div>
    </section>
  );
}
