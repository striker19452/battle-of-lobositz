import type { AttackResolution, Locale } from "../game/types";
import { translate } from "../i18n";

export interface CombatReport {
  attackerIds: string[];
  defenderId: string;
  resolution: AttackResolution;
}

interface FormulaTerm {
  key: string;
  label: string;
  value: number;
}

function Formula({
  label,
  terms,
  total
}: {
  label: string;
  terms: FormulaTerm[];
  total: number;
}) {
  return (
    <div className="combat-formula">
      <h3>{label}</h3>
      <div className="combat-equation">
        {terms.map((term, index) => (
          <div className="combat-equation__part" key={term.key}>
            {index > 0 && (
              <span className="combat-equation__operator" aria-hidden="true">
                +
              </span>
            )}
            <span className="combat-equation__term">
              <b>{term.value}</b>
              <small>{term.label}</small>
            </span>
          </div>
        ))}
        <span className="combat-equation__operator" aria-hidden="true">
          =
        </span>
        <strong className="combat-equation__total">{total}</strong>
      </div>
    </div>
  );
}

export function CombatResult({
  locale,
  report
}: {
  locale: Locale;
  report: CombatReport;
}) {
  const { resolution } = report;
  const defenseTerms: FormulaTerm[] = [
    {
      key: "base",
      label: translate(locale, "combat.term.base"),
      value: resolution.defenseBase
    },
    {
      key: "terrain",
      label: translate(locale, "combat.term.terrain"),
      value: resolution.defenseTerrainBonus
    }
  ];
  if (resolution.defenseFieldworksBonus > 0) {
    defenseTerms.push({
      key: "fieldworks",
      label: translate(locale, "combat.term.fieldworks"),
      value: resolution.defenseFieldworksBonus
    });
  }
  if (resolution.defenseElevationBonus > 0) {
    defenseTerms.push({
      key: "elevation",
      label: translate(locale, "combat.term.elevation"),
      value: resolution.defenseElevationBonus
    });
  }

  return (
    <section
      className={`combat-result combat-result--${resolution.outcome}`}
      role="status"
      aria-live="polite"
    >
      <header className="combat-result__heading">
        <div>
          <span>{translate(locale, "combat.title")}</span>
          <strong>
            {report.attackerIds.join(" + ")} → {report.defenderId}
          </strong>
        </div>
        <b>{translate(locale, `combat.result.${resolution.outcome}`)}</b>
      </header>

      <div className="combat-result__formulas">
        <Formula
          label={translate(locale, "combat.attack")}
          terms={[
            {
              key: "base",
              label: translate(locale, "combat.term.base"),
              value: resolution.attackFactor
            },
            {
              key: "die",
              label: translate(locale, "combat.term.die"),
              value: resolution.die
            }
          ]}
          total={resolution.attackTotal}
        />
        <Formula
          label={translate(locale, "combat.defense")}
          terms={defenseTerms}
          total={resolution.defenseTotal}
        />
      </div>

      <p className="combat-result__outcome">
        {translate(locale, `combat.reason.${resolution.outcomeReason}`, {
          hex: resolution.retreatHex ?? ""
        })}
      </p>
    </section>
  );
}
