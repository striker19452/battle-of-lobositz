import { useState } from "react";
import type { Locale } from "../game/types";
import { translate } from "../i18n";

interface GameGuideProps {
  locale: Locale;
  placement: "setup" | "sidebar";
  initiallyOpen?: boolean;
}

const TURN_STEPS = ["move", "attack", "end"] as const;
const KEY_RULES = ["zoc", "terrain", "combat", "ranged"] as const;

export function GameGuide({
  locale,
  placement,
  initiallyOpen = false
}: GameGuideProps) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <details
      className={`game-guide game-guide--${placement}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <small>{translate(locale, "guide.eyebrow")}</small>
          <strong>{translate(locale, "guide.title")}</strong>
        </span>
        <span className="game-guide__duration">
          {translate(locale, "guide.duration")}
        </span>
      </summary>

      <div className="game-guide__body">
        <div className="game-guide__briefing">
          <section>
            <h3>{translate(locale, "guide.background.title")}</h3>
            <p>{translate(locale, "guide.background.body")}</p>
          </section>

          <section>
            <h3>{translate(locale, "guide.objective.title")}</h3>
            <dl className="game-guide__objectives">
              <div>
                <dt>{translate(locale, "side.prussian")}</dt>
                <dd>{translate(locale, "guide.objective.prussian")}</dd>
              </div>
              <div>
                <dt>{translate(locale, "side.austrian")}</dt>
                <dd>{translate(locale, "guide.objective.austrian")}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="game-guide__turn">
          <h3>{translate(locale, "guide.turn.title")}</h3>
          <ol>
            {TURN_STEPS.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{translate(locale, `guide.turn.${step}.title`)}</strong>
                  <p>{translate(locale, `guide.turn.${step}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="game-guide__rules">
          <h3>{translate(locale, "guide.rules.title")}</h3>
          <ul>
            {KEY_RULES.map((rule) => (
              <li key={rule}>{translate(locale, `guide.rule.${rule}`)}</li>
            ))}
          </ul>
          <p className="game-guide__tip">{translate(locale, "guide.tip")}</p>
        </section>
      </div>
    </details>
  );
}
