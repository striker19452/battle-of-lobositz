import type { CSSProperties } from "react";
import type { Locale } from "../game/types";
import { translate } from "../i18n";

export interface DiceRollState {
  phase: "rolling" | "result";
  value: number;
}

const FACE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9]
};

const FINAL_ROTATION: Record<number, { x: string; y: string }> = {
  1: { x: "720deg", y: "720deg" },
  2: { x: "630deg", y: "720deg" },
  3: { x: "720deg", y: "630deg" },
  4: { x: "720deg", y: "810deg" },
  5: { x: "810deg", y: "720deg" },
  6: { x: "720deg", y: "900deg" }
};

const FACE_CLASS: Record<number, string> = {
  1: "die-face--front",
  2: "die-face--top",
  3: "die-face--right",
  4: "die-face--left",
  5: "die-face--bottom",
  6: "die-face--back"
};

function DieFace({ value }: { value: number }) {
  return (
    <div className={`die-face ${FACE_CLASS[value]}`}>
      {FACE_PIPS[value].map((position) => (
        <span key={position} className={`die-pip die-pip--${position}`} />
      ))}
    </div>
  );
}

export function DiceRoll({
  locale,
  roll
}: {
  locale: Locale;
  roll: DiceRollState;
}) {
  const rotation = FINAL_ROTATION[roll.value];
  const style = {
    "--die-final-x": rotation.x,
    "--die-final-y": rotation.y
  } as CSSProperties;
  const isRolling = roll.phase === "rolling";

  return (
    <section
      className={`dice-roll ${isRolling ? "is-rolling" : "is-result"}`}
      role="status"
      aria-live="polite"
      aria-label={translate(
        locale,
        isRolling ? "dice.ariaRolling" : "dice.ariaResult",
        { value: roll.value }
      )}
    >
      <div className="die-scene" aria-hidden="true">
        <div className="die-cube" style={style}>
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <DieFace key={value} value={value} />
          ))}
        </div>
      </div>
      <div className="dice-roll__copy">
        <span>{translate(locale, "dice.label")}</span>
        <strong>
          {translate(locale, isRolling ? "dice.rolling" : "dice.result", {
            value: roll.value
          })}
        </strong>
        <small>
          {isRolling
            ? translate(locale, "dice.locked")
            : translate(locale, "dice.resultDetail", { value: roll.value })}
        </small>
      </div>
    </section>
  );
}
