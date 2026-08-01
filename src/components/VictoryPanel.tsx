import { useEffect, useRef } from "react";
import type { Locale, Side } from "../game/types";
import { translate } from "../i18n";

interface VictoryPanelProps {
  locale: Locale;
  winner: Side;
  onViewBattlefield: () => void;
  onRestart: () => void;
}

export function VictoryPanel({
  locale,
  winner,
  onViewBattlefield,
  onRestart
}: VictoryPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const winnerName = translate(locale, `side.${winner}`);

  return (
    <dialog
      ref={dialogRef}
      className={`victory-dialog victory-dialog--${winner}`}
      aria-labelledby="victory-title"
      aria-describedby="victory-description"
      onCancel={(event) => {
        event.preventDefault();
        onViewBattlefield();
      }}
    >
      <div className="victory-dialog__content">
        <span className="victory-dialog__eyebrow">
          {translate(locale, "victory.eyebrow")}
        </span>
        <div className="victory-dialog__heading">
          <i className={`side-mark side-mark--${winner}`} aria-hidden="true" />
          <h2 id="victory-title">
            {translate(locale, "turn.winner", { side: winnerName })}
          </h2>
        </div>
        <p id="victory-description">
          {translate(locale, `victory.condition.${winner}`)}
        </p>

        {winner === "prussian" && (
          <div
            className="victory-dialog__objectives"
            aria-label={translate(locale, "victory.objectives")}
          >
            <span>6,2</span>
            <b aria-hidden="true">+</b>
            <span>7,3</span>
          </div>
        )}

        <div className="victory-dialog__actions">
          <button type="button" autoFocus onClick={onViewBattlefield}>
            {translate(locale, "victory.viewBattlefield")}
          </button>
          <button type="button" onClick={onRestart}>
            {translate(locale, "victory.restart")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
