import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AudioOutputController } from "../hooks/useAudioPlayer";
import type { OutputRoutingController } from "../hooks/useOutputRouting";
import { OutputSettingsDialog } from "./OutputSettingsDialog";

afterEach(cleanup);

const streamingProps = {
  activeRoute: "internal" as const,
  activeServerUrl: "http://music.test",
  routeStatus: "stable" as const,
  streamingPreferences: { mode: "auto" as const, maxBitRate: 256 },
  onSetStreamingMode: vi.fn(),
  onSetStreamingMaxBitRate: vi.fn(),
};

function localOutput(): AudioOutputController {
  return {
    supported: true,
    deviceId: "phone-speaker",
    label: "Phone speaker",
    devices: [
      { deviceId: "phone-speaker", label: "Phone speaker" },
      { deviceId: "headphones", label: "USB headphones" },
    ],
    refreshDevices: vi.fn(async () => undefined),
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
  it("exposes automatic, original, and limited bitrate policies", async () => {
    const user = userEvent.setup();
    const onSetStreamingMode = vi.fn();
    const onSetStreamingMaxBitRate = vi.fn();
    render(
      <OutputSettingsDialog
        routing={routing()}
        localOutput={localOutput()}
        {...streamingProps}
        onSetStreamingMode={onSetStreamingMode}
        onSetStreamingMaxBitRate={onSetStreamingMaxBitRate}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Active route:/)).toHaveTextContent("internal network");
    expect(screen.getByRole("radio", { name: /Automatic/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Always original/ }));
    expect(onSetStreamingMode).toHaveBeenCalledWith("original");
    await user.selectOptions(screen.getByLabelText("Maximum bitrate"), "128");
    expect(onSetStreamingMaxBitRate).toHaveBeenCalledWith(128);
  });

  it("switches directly between client and built-in server outputs without another setup flow", async () => {
    const user = userEvent.setup();
    const activeRouting = routing();
    const activeLocalOutput = localOutput();
    const onClose = vi.fn();
    render(
      <OutputSettingsDialog
        routing={activeRouting}
        localOutput={activeLocalOutput}
        {...streamingProps}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("heading", { name: "Audio & streaming" })).toBeInTheDocument();
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

  it("selects an enumerated client-side output device", async () => {
    const user = userEvent.setup();
    const activeLocalOutput = localOutput();
    render(
      <OutputSettingsDialog
        routing={routing()}
        localOutput={activeLocalOutput}
        {...streamingProps}
        onClose={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Client audio device"), "headphones");
    expect(activeLocalOutput.selectDevice).toHaveBeenCalledWith("headphones");
    await user.click(screen.getByRole("button", { name: "Refresh client devices" }));
    expect(activeLocalOutput.refreshDevices).toHaveBeenCalledWith(true);
  });

  it("shows cross-browser insecure-origin guidance with the current LAN address", () => {
    const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    const unsupportedLocalOutput = {
      ...localOutput(),
      supported: false,
      deviceId: "",
      devices: [],
    };

    try {
      render(
        <OutputSettingsDialog
          routing={routing()}
          localOutput={unsupportedLocalOutput}
          {...streamingProps}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("Enable client audio devices on this HTTP address")).toBeInTheDocument();
      expect(screen.getByText("chrome://flags/#unsafely-treat-insecure-origin-as-secure")).toBeInTheDocument();
      expect(screen.getByText("edge://flags/#unsafely-treat-insecure-origin-as-secure")).toBeInTheDocument();
      expect(screen.getByText("dom.securecontext.allowlist")).toBeInTheDocument();
      expect(screen.getByText(/Safari has no equivalent HTTP secure-origin override/)).toBeInTheDocument();
      expect(screen.getAllByText(window.location.origin)).toHaveLength(2);
      expect(screen.getByText(/Only use them for an address you trust/)).toBeInTheDocument();
    } finally {
      if (secureContextDescriptor) {
        Object.defineProperty(window, "isSecureContext", secureContextDescriptor);
      } else {
        Reflect.deleteProperty(window, "isSecureContext");
      }
    }
  });
});
