import { BOARD_BY_ID } from "../game/scenario";
import type { HexId, Locale, Unit } from "../game/types";
import { translate } from "../i18n";

interface RetreatPanelProps {
  locale: Locale;
  defender: Unit;
  origin: HexId;
  destinations: HexId[];
  mayHold: boolean;
  selectedDestination: HexId | null;
  onSelect: (destination: HexId) => void;
  onConfirm: () => void;
  onHold: () => void;
}

export function RetreatPanel({
  locale,
  defender,
  origin,
  destinations,
  mayHold,
  selectedDestination,
  onSelect,
  onConfirm,
  onHold
}: RetreatPanelProps) {
  return (
    <section
      className="retreat-panel"
      aria-labelledby="retreat-title"
      aria-live="polite"
    >
      <header className="retreat-panel__heading">
        <div>
          <span>{translate(locale, "retreat.pending")}</span>
          <h2 id="retreat-title">{translate(locale, "retreat.title")}</h2>
        </div>
        <strong>
          {defender.id} · {origin}
        </strong>
      </header>

      <p className="retreat-panel__rule">
        {translate(
          locale,
          mayHold ? "retreat.rule.optional" : "retreat.rule.required"
        )}
      </p>

      <div
        className="retreat-panel__destinations"
        role="group"
        aria-label={translate(locale, "retreat.choose")}
      >
        {destinations.map((destination) => {
          const cell = BOARD_BY_ID.get(destination);
          const terrain = cell?.terrain
            .map((kind) => translate(locale, `terrain.${kind}`))
            .join(" · ");
          const selected = destination === selectedDestination;
          return (
            <button
              key={destination}
              type="button"
              className={selected ? "is-selected" : ""}
              aria-pressed={selected}
              onClick={() => onSelect(destination)}
            >
              <strong>{destination}</strong>
              <small>{terrain}</small>
            </button>
          );
        })}
      </div>

      <div className={`retreat-panel__actions ${mayHold ? "has-hold" : ""}`}>
        <button
          type="button"
          className="retreat-panel__confirm"
          disabled={!selectedDestination}
          onClick={onConfirm}
        >
          {translate(
            locale,
            selectedDestination ? "retreat.confirm" : "retreat.chooseFirst"
          )}
        </button>
        {mayHold && (
          <button type="button" className="retreat-panel__hold" onClick={onHold}>
            {translate(locale, "retreat.hold")}
          </button>
        )}
      </div>
    </section>
  );
}
