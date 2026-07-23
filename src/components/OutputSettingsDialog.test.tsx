import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AudioOutputController } from "../hooks/useAudioPlayer";
import type { OutputRoutingController } from "../hooks/useOutputRouting";
import { OutputSettingsDialog } from "./OutputSettingsDialog";

afterEach(cleanup);

function localOutput(): AudioOutputController {
  return {
    supported: true,
    deviceId: "phone-speaker",
    label: "Phone speaker",
    selectDevice: vi.fn(async () => undefined),
    useSystemDefault: vi.fn(async () => undefined),
  };
}

function routing(): OutputRoutingController {
  return {
    route: "local",
    connectionStatus: "connected",
    serverName: "studio-server",
    serverState: {
      connected: true,
      title: "Blue Hour",
      artist: "Signal Club",
      trackId: "song-1",
      isPlaying: false,
      progress: 0,
      duration: 245,
      volume: 0.86,
      muted: false,
      serverUrl: "https://music.test",
      outputDevices: [
        { deviceId: "speaker", label: "Server Speakers" },
        { deviceId: "headphones", label: "External Headphones" },
      ],
      selectedOutputDeviceId: "speaker",
      outputError: "",
      platform: "linux",
      deviceBackend: "pipewire",
      canSelectOutputDevice: true,
    },
    player: {} as OutputRoutingController["player"],
    reconnect: vi.fn(),
    disconnect: vi.fn(),
    useLocalOutput: vi.fn(),
    useServerOutput: vi.fn(),
    refreshServerDevices: vi.fn(),
    selectServerDevice: vi.fn(),
  };
}

describe("OutputSettingsDialog", () => {
  it("switches directly between client and built-in server outputs without another setup flow", async () => {
    const user = userEvent.setup();
    const activeRouting = routing();
    const activeLocalOutput = localOutput();
    const onClose = vi.fn();
    render(
      <OutputSettingsDialog
        routing={activeRouting}
        localOutput={activeLocalOutput}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("heading", { name: "Audio output" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close audio output settings" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Refresh devices" })).toHaveFocus();
    expect(screen.getByRole("button", { name: /This device/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Server audio/ }));
    expect(activeRouting.useServerOutput).toHaveBeenCalledOnce();

    await user.selectOptions(screen.getByLabelText("Server audio device"), "headphones");
    expect(activeRouting.selectServerDevice).toHaveBeenCalledWith("headphones");
    expect(screen.getByText("npm run output-server")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the browser speaker picker for client-side playback", async () => {
    const user = userEvent.setup();
    const activeLocalOutput = localOutput();
    render(
      <OutputSettingsDialog
        routing={routing()}
        localOutput={activeLocalOutput}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose audio device" }));
    expect(activeLocalOutput.selectDevice).toHaveBeenCalledOnce();
  });
});
