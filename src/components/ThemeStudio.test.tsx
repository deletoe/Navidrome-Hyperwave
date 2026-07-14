import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VISUAL_PREFERENCES,
  type VisualPreferences,
} from "../lib/visualPreferences";
import type { CoverPalette, VisualTheme } from "../types";
import { ThemeStudio, type ThemeStudioProps } from "./ThemeStudio";

const theme: VisualTheme = {
  id: "cyber",
  name: "Neon Circuit",
  signal: "Electronic signal / midnight grid",
  colors: {
    background: "#02080c",
    surface: "rgba(3, 18, 24, .86)",
    surfaceStrong: "#061f29",
    primary: "#54ffe1",
    secondary: "#ff4fd8",
    text: "#eafffb",
    muted: "#8fb8b3",
    border: "rgba(84, 255, 225, .42)",
  },
  fontFamily: "mono",
  radius: "4px",
  density: "compact",
  frameStyle: "line",
  texture: "neon coordinate grid",
  motionDuration: 640,
  scene: {
    layout: "console",
    transition: "scan",
    asset: "/assets/themes/cyber-ambient.webp",
    foregroundAsset: "/assets/themes/cyber-foreground.webp",
    assetMode: "tile",
    displayFont: "monospace",
    bodyFont: "monospace",
  },
};

const palette: CoverPalette = {
  primary: "#44ddcc",
  secondary: "#ee55bb",
  dark: "#061015",
};

function preferences(
  overrides: Partial<VisualPreferences> = {},
): VisualPreferences {
  return {
    ...DEFAULT_VISUAL_PREFERENCES,
    intensity: 78,
    visualizer: "spectrum",
    genreMappings: [],
    ...overrides,
  };
}

function props(overrides: Partial<ThemeStudioProps> = {}): ThemeStudioProps {
  return {
    theme,
    paletteStatus: "ready",
    palette,
    currentCoverUrl: "/cover/night-drive.jpg",
    preferences: preferences(),
    genres: ["Electronic", "Rock", "Jazz"],
    updateIntensity: vi.fn(),
    setPaletteEnabled: vi.fn(),
    setVisualizerMode: vi.fn(),
    upsertGenreMapping: vi.fn(),
    removeGenreMapping: vi.fn(),
    resetGenreMappings: vi.fn(),
    previewThemeId: "auto",
    setPreviewThemeId: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("ThemeStudio", () => {
  it("renders the live cover palette and exposes native intensity and visualizer controls", async () => {
    const user = userEvent.setup();
    const updateIntensity = vi.fn();
    const setPaletteEnabled = vi.fn();
    const setVisualizerMode = vi.fn();

    render(
      <ThemeStudio
        {...props({ updateIntensity, setPaletteEnabled, setVisualizerMode })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Theme studio" })).toBeInTheDocument();
    expect(screen.getAllByText("Neon Circuit").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: "Current album cover for Neon Circuit" }),
    ).toHaveAttribute("src", "/cover/night-drive.jpg");
    expect(screen.getByText("Current cover colors are active")).toHaveAttribute(
      "role",
      "status",
    );

    const swatches = screen.getByRole("list", { name: "Extracted cover colors" });
    expect(within(swatches).getByText("#44ddcc")).toBeInTheDocument();
    expect(within(swatches).getByText("#ee55bb")).toBeInTheDocument();
    expect(within(swatches).getByText("#061015")).toBeInTheDocument();

    const intensity = screen.getByRole("slider", { name: "Theme intensity" });
    expect(intensity).toHaveValue("78");
    expect(intensity).toHaveAttribute("aria-valuetext", "78 percent visual intensity");
    fireEvent.change(intensity, { target: { value: "96" } });
    expect(updateIntensity).toHaveBeenCalledWith(96);

    const paletteToggle = screen.getByRole("checkbox", {
      name: /use current cover colors/i,
    });
    expect(paletteToggle).toBeChecked();
    await user.click(paletteToggle);
    expect(setPaletteEnabled).toHaveBeenCalledWith(false);

    const visualizer = screen.getByRole("group", { name: "Live audio visualizer" });
    expect(within(visualizer).getByText("Neon console stage")).toBeInTheDocument();
    expect(within(visualizer).getByRole("radio", { name: /^Spectrum/ })).toBeChecked();
    await user.click(within(visualizer).getByRole("radio", { name: /^Hybrid/ }));
    expect(setVisualizerMode).toHaveBeenCalledWith("hybrid");
  });

  it("offers automatic plus all seven personalities as preview cards", async () => {
    const user = userEvent.setup();
    const setPreviewThemeId = vi.fn();

    render(<ThemeStudio {...props({ setPreviewThemeId, previewThemeId: "auto" })} />);

    const preview = screen.getByRole("group", {
      name: "Choose a temporary personality",
    });
    expect(within(preview).getAllByRole("radio")).toHaveLength(8);
    expect(within(preview).getByRole("radio", { name: /^Automatic/ })).toBeChecked();

    await user.click(within(preview).getByRole("radio", { name: /^Pixel Quest/ }));
    expect(setPreviewThemeId).toHaveBeenCalledWith("pixel");
    expect(within(preview).getByText("Currently active")).toBeInTheDocument();
  });

  it("explains Web Audio fallback without disabling normal playback", () => {
    render(
      <ThemeStudio
        {...props({
          visualizerSupported: true,
          visualizerStatus: "unavailable",
          visualizerError: "The audio stream could not be connected to Web Audio",
        })}
      />,
    );

    const visualizer = screen.getByRole("group", { name: "Live audio visualizer" });
    expect(within(visualizer).getByRole("status")).toHaveTextContent(
      /normal playback remains available/i,
    );
  });

  it("filters actual library genres and treats Automatic as mapping removal", async () => {
    const user = userEvent.setup();
    const upsertGenreMapping = vi.fn();
    const removeGenreMapping = vi.fn();
    const resetGenreMappings = vi.fn();
    const mappedPreferences = preferences({
      genreMappings: [
        { genre: "rock", theme: "rock" },
        { genre: "orphan genre", theme: "cyber" },
      ],
    });

    render(
      <ThemeStudio
        {...props({
          preferences: mappedPreferences,
          genres: ["Electronic", "Rock", "Jazz", "Rock", "  "],
          upsertGenreMapping,
          removeGenreMapping,
          resetGenreMappings,
        })}
      />,
    );

    const rock = screen.getByRole("combobox", { name: "Theme for Rock" });
    expect(rock).toHaveValue("rock");
    expect(
      screen.getByRole("combobox", { name: "Theme for orphan genre" }),
    ).toHaveValue("cyber");

    await user.selectOptions(rock, "auto");
    expect(removeGenreMapping).toHaveBeenCalledWith("Rock");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Theme for Electronic" }),
      "bloom",
    );
    expect(upsertGenreMapping).toHaveBeenCalledWith("Electronic", "bloom");

    await user.click(screen.getByRole("button", { name: "Reset Rock to automatic" }));
    expect(removeGenreMapping).toHaveBeenCalledWith("Rock");

    await user.type(screen.getByRole("searchbox", { name: "Filter library genres" }), "jazz");
    expect(screen.getByRole("combobox", { name: "Theme for Jazz" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Theme for Rock" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 4 genres")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset all" }));
    expect(resetGenreMappings).toHaveBeenCalledTimes(1);
  });

  it("shows a useful empty mapping state before genres load", () => {
    render(
      <ThemeStudio
        {...props({
          paletteStatus: "idle",
          palette: undefined,
          currentCoverUrl: undefined,
          preferences: preferences({ coverPalette: false }),
          genres: [],
        })}
      />,
    );

    expect(screen.getByText("Album color response is off")).toBeInTheDocument();
    expect(screen.getByText("No library genres are available yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled();
  });
});
