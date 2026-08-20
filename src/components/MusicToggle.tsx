import type { MusicStatus } from "../audio/useBackgroundMusic";
import type { Locale } from "../game/types";
import { translate } from "../i18n";

interface MusicToggleProps {
  enabled: boolean;
  locale: Locale;
  status: MusicStatus;
  onToggle: () => void;
}

export function MusicToggle({
  enabled,
  locale,
  status,
  onToggle
}: MusicToggleProps) {
  const labelKey =
    status === "loading"
      ? "music.loading"
      : status === "error"
        ? "music.error"
        : enabled
          ? "music.turnOff"
          : "music.turnOn";

  return (
    <button
      type="button"
      className={`music-button is-${status}`}
      aria-label={translate(locale, labelKey)}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5v5h3.25L12 18.25V5.75L7.25 9.5H4Z" />
        {enabled ? (
          <>
            <path className="music-button__wave" d="M15 9a4.25 4.25 0 0 1 0 6" />
            <path className="music-button__wave" d="M17.6 6.5a7.75 7.75 0 0 1 0 11" />
          </>
        ) : (
          <path className="music-button__slash" d="m15.25 9.25 5.5 5.5m0-5.5-5.5 5.5" />
        )}
      </svg>
      <span>
        {translate(locale, enabled ? "music.on" : "music.off")}
      </span>
      <i aria-hidden="true" />
    </button>
  );
}
