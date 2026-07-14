import { useId, useMemo, useState, type CSSProperties } from "react";

import {
  THEME_IDS,
  VISUALIZER_MODES,
  normalizeGenre,
  type VisualPreferences,
  type VisualizerMode,
} from "../lib/visualPreferences";
import { VISUALIZER_STRATEGIES } from "../lib/visualizerRenderer";
import type { CoverPalette, ThemeId, VisualTheme } from "../types";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";

export type PaletteStatus = "idle" | "loading" | "ready" | "unavailable";
export type ThemePreviewId = "auto" | ThemeId;
export type VisualizerAvailabilityStatus = "off" | "waiting" | "ready" | "unavailable";

export interface ThemeStudioProps {
  theme: VisualTheme;
  paletteStatus: PaletteStatus;
  palette?: CoverPalette;
  currentCoverUrl?: string;
  preferences: VisualPreferences;
  genres: string[];
  visualizerSupported?: boolean;
  visualizerStatus?: VisualizerAvailabilityStatus;
  visualizerError?: string;
  updateIntensity: (intensity: number) => void;
  setPaletteEnabled: (enabled: boolean) => void;
  setVisualizerMode: (mode: VisualPreferences["visualizer"]) => void;
  upsertGenreMapping: (genre: string, theme: ThemeId) => void;
  removeGenreMapping: (genre: string) => void;
  resetGenreMappings: () => void;
  previewThemeId: ThemePreviewId;
  setPreviewThemeId: (theme: ThemePreviewId) => void;
}

const THEME_NAMES: Record<ThemeId, string> = {
  prism: "Prism Archive",
  cyber: "Neon Circuit",
  bloom: "Soft Bloom",
  pixel: "Pixel Quest",
  rock: "Riot Stage",
  cinematic: "Silver Screen",
  lounge: "Midnight Club",
};

const VISUALIZER_COPY: Record<VisualizerMode, {
  label: string;
  description: string;
}> = {
  off: {
    label: "Off",
    description: "Keep the personality artwork without a live audio layer.",
  },
  spectrum: {
    label: "Spectrum",
    description: "Draw the current track as a theme-shaped frequency field.",
  },
  particles: {
    label: "Particles",
    description: "Let beats and transients drive a field of themed particles.",
  },
  hybrid: {
    label: "Hybrid",
    description: "Layer the frequency field and particles for the fullest stage.",
  },
};

const VISUALIZER_OPTIONS = VISUALIZER_MODES.map((value) => ({
  value,
  ...VISUALIZER_COPY[value],
}));

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function statusText(status: PaletteStatus, enabled: boolean): string {
  if (!enabled) return "Album color response is off";
  if (status === "loading") return "Extracting colors from the current cover";
  if (status === "ready") return "Current cover colors are active";
  if (status === "unavailable") return "The current cover has no usable palette";
  return "Waiting for a playable cover";
}

function visualizerStatusText(
  status: VisualizerAvailabilityStatus,
  supported: boolean,
  error?: string,
): string {
  if (!supported) return "Web Audio is not supported here; normal playback is unchanged.";
  if (status === "off") return "The live audio layer is off.";
  if (status === "ready") return "Live analyser connected to the current player.";
  if (status === "unavailable") {
    return error
      ? `${error}. Normal playback remains available.`
      : "The live analyser is unavailable; normal playback remains available.";
  }
  return "The analyser will connect on your next playback gesture.";
}

export function ThemeStudio({
  theme,
  paletteStatus,
  palette,
  currentCoverUrl,
  preferences,
  genres,
  visualizerSupported = true,
  visualizerStatus = "waiting",
  visualizerError,
  updateIntensity,
  setPaletteEnabled,
  setVisualizerMode,
  upsertGenreMapping,
  removeGenreMapping,
  resetGenreMappings,
  previewThemeId,
  setPreviewThemeId,
}: ThemeStudioProps) {
  const headingId = useId();
  const intensityId = useId();
  const paletteToggleId = useId();
  const filterId = useId();
  const visualizerName = useId();
  const previewName = useId();
  const responseHeadingId = useId();
  const previewHeadingId = useId();
  const mappingHeadingId = useId();
  const [filter, setFilter] = useState("");

  const mappingByGenre = useMemo(
    () =>
      new Map(
        preferences.genreMappings.map((mapping) => [
          normalizeGenre(mapping.genre),
          mapping.theme,
        ]),
      ),
    [preferences.genreMappings],
  );

  const allGenres = useMemo(() => {
    const values = new Map<string, string>();
    for (const mapping of preferences.genreMappings) {
      const genre = mapping.genre.trim();
      if (genre) values.set(normalizeGenre(genre), genre);
    }
    for (const value of genres) {
      const genre = value.trim();
      if (genre) values.set(normalizeGenre(genre), genre);
    }
    return [...values.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
    );
  }, [genres, preferences.genreMappings]);

  const normalizedFilter = normalizeGenre(filter);
  const visibleGenres = normalizedFilter
    ? allGenres.filter((genre) => normalizeGenre(genre).includes(normalizedFilter))
    : allGenres;
  const paletteColors = Object.entries(palette ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
  );
  const paletteMessage = statusText(paletteStatus, preferences.coverPalette);

  return (
    <div className="view view--theme-studio theme-studio" aria-labelledby={headingId}>
      <header className="theme-studio__hero">
        <div className="theme-studio__intro">
          <p className="eyebrow">Visual direction / live controls</p>
          <h1 id={headingId}>Theme studio</h1>
          <p>
            Shape how album colors, live audio, and library genres drive all seven visual
            personalities.
          </p>
          <dl className="theme-studio__current-theme">
            <div>
              <dt>Current personality</dt>
              <dd>{theme.name}</dd>
            </div>
            <div>
              <dt>Signal</dt>
              <dd>{theme.signal}</dd>
            </div>
          </dl>
        </div>

        <figure className="theme-studio__palette-preview">
          <Artwork
            className="theme-studio__cover"
            src={currentCoverUrl}
            alt={`Current album cover for ${theme.name}`}
            eager
          />
          <figcaption>
            <strong>Cover color response</strong>
            <span role="status">{paletteMessage}</span>
          </figcaption>
          {paletteColors.length > 0 ? (
            <ul className="theme-studio__swatches" aria-label="Extracted cover colors">
              {paletteColors.map(([name, color]) => (
                <li key={name}>
                  <span
                    className="theme-studio__swatch"
                    style={{
                      "--swatch-color": color,
                      backgroundColor: color,
                    } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span>{humanize(name)}</span>
                  <code>{color}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </figure>
      </header>

      <section className="theme-studio__surface" aria-labelledby={responseHeadingId}>
        <header className="section-heading">
          <div>
            <p className="eyebrow">Signal response</p>
            <h2 id={responseHeadingId}>Color and motion strength</h2>
          </div>
          <span>{preferences.intensity}%</span>
        </header>

        <div className="theme-studio__control-grid">
          <fieldset className="theme-studio__control-card">
            <legend>Live audio visualizer</legend>
            <div className="theme-studio__visualizer-strategy">
              <AppIcon name="visualizer" />
              <span>
                <strong>{THEME_NAMES[theme.id]}</strong>
                <span>{humanize(VISUALIZER_STRATEGIES[theme.id])} stage</span>
              </span>
            </div>
            <p
              className="theme-studio__visualizer-status"
              data-status={visualizerStatus}
              role="status"
            >
              {visualizerStatusText(
                visualizerStatus,
                visualizerSupported,
                visualizerError,
              )}
            </p>
            <div className="theme-studio__choice-grid">
              {VISUALIZER_OPTIONS.map((option) => (
                <label className="theme-studio__choice" key={option.value}>
                  <input
                    type="radio"
                    name={visualizerName}
                    value={option.value}
                    checked={preferences.visualizer === option.value}
                    disabled={!visualizerSupported && option.value !== "off"}
                    onChange={() => setVisualizerMode(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="theme-studio__control-card">
            <legend>Album palette</legend>
            <label className="theme-studio__toggle" htmlFor={paletteToggleId}>
              <input
                id={paletteToggleId}
                type="checkbox"
                checked={preferences.coverPalette}
                onChange={(event) => setPaletteEnabled(event.currentTarget.checked)}
              />
              <span>
                <strong>Use current cover colors</strong>
                <span>Blend extracted accents into the active personality.</span>
              </span>
            </label>

            <div className="theme-studio__range-control">
              <div>
                <label htmlFor={intensityId}>Theme intensity</label>
                <output htmlFor={intensityId}>{preferences.intensity}%</output>
              </div>
              <input
                id={intensityId}
                type="range"
                min="0"
                max="100"
                step="1"
                value={preferences.intensity}
                aria-valuetext={`${preferences.intensity} percent visual intensity`}
                onChange={(event) => updateIntensity(event.currentTarget.valueAsNumber)}
              />
              <div className="theme-studio__range-labels" aria-hidden="true">
                <span>Quiet</span>
                <span>Maximal</span>
              </div>
            </div>
          </fieldset>

        </div>
      </section>

      <section className="theme-studio__surface" aria-labelledby={previewHeadingId}>
        <header className="section-heading">
          <div>
            <p className="eyebrow">Manual audition</p>
            <h2 id={previewHeadingId}>Personality preview</h2>
          </div>
          <span>Playback stays uninterrupted</span>
        </header>

        <fieldset className="theme-studio__preview-fieldset">
          <legend>Choose a temporary personality</legend>
          <div className="theme-studio__preview-grid">
            <label className="theme-studio__preview-card" data-preview-theme="auto">
              <input
                type="radio"
                name={previewName}
                value="auto"
                checked={previewThemeId === "auto"}
                onChange={() => setPreviewThemeId("auto")}
              />
              <span className="theme-studio__preview-art" aria-hidden="true" />
              <span>
                <strong>Automatic</strong>
                <span>Follow the current track and your genre mappings.</span>
              </span>
            </label>
            {THEME_IDS.map((themeId) => (
              <label
                className="theme-studio__preview-card"
                data-preview-theme={themeId}
                key={themeId}
              >
                <input
                  type="radio"
                  name={previewName}
                  value={themeId}
                  checked={previewThemeId === themeId}
                  onChange={() => setPreviewThemeId(themeId)}
                />
                <span className="theme-studio__preview-art" aria-hidden="true" />
                <span>
                  <strong>{THEME_NAMES[themeId]}</strong>
                  <span>{themeId === theme.id ? "Currently active" : `Preview ${themeId}`}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="theme-studio__surface" aria-labelledby={mappingHeadingId}>
        <header className="section-heading theme-studio__mapping-heading">
          <div>
            <p className="eyebrow">Library routing</p>
            <h2 id={mappingHeadingId}>Genre personality mapping</h2>
          </div>
          <button
            className="button-with-icon button-with-icon--compact"
            type="button"
            disabled={preferences.genreMappings.length === 0}
            onClick={resetGenreMappings}
          >
            <AppIcon name="retry" />
            Reset all
          </button>
        </header>

        <div className="theme-studio__mapping-tools">
          <label htmlFor={filterId}>Filter library genres</label>
          <div className="theme-studio__filter">
            <AppIcon name="search" />
            <input
              id={filterId}
              type="search"
              value={filter}
              placeholder="Search genres"
              onChange={(event) => setFilter(event.currentTarget.value)}
            />
          </div>
          <span aria-live="polite">
            Showing {visibleGenres.length} of {allGenres.length} genres
          </span>
        </div>

        {allGenres.length === 0 ? (
          <div className="inline-state inline-state--empty">
            <p>No library genres are available yet.</p>
          </div>
        ) : visibleGenres.length === 0 ? (
          <div className="inline-state inline-state--empty">
            <p>No genres match “{filter.trim()}”.</p>
            <button className="button-with-icon" type="button" onClick={() => setFilter("")}>
              <AppIcon name="close" />
              Clear filter
            </button>
          </div>
        ) : (
          <ul className="theme-studio__mapping-list">
            {visibleGenres.map((genre) => {
              const normalizedGenre = normalizeGenre(genre);
              const mappedTheme = mappingByGenre.get(normalizedGenre);
              const selectId = `${filterId}-${encodeURIComponent(normalizedGenre)}`;
              return (
                <li className="theme-studio__mapping-row" key={normalizedGenre}>
                  <label htmlFor={selectId}>{genre}</label>
                  <select
                    id={selectId}
                    aria-label={`Theme for ${genre}`}
                    value={mappedTheme ?? "auto"}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === "auto") removeGenreMapping(genre);
                      else upsertGenreMapping(genre, value as ThemeId);
                    }}
                  >
                    <option value="auto">Automatic</option>
                    {THEME_IDS.map((themeId) => (
                      <option value={themeId} key={themeId}>
                        {THEME_NAMES[themeId]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Reset ${genre} to automatic`}
                    title={`Reset ${genre} to automatic`}
                    disabled={!mappedTheme}
                    onClick={() => removeGenreMapping(genre)}
                  >
                    <AppIcon name="retry" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
