import { useEffect, useRef, useState } from "react";

import type { AudioOutputController } from "../hooks/useAudioPlayer";
import type { OutputRoutingController } from "../hooks/useOutputRouting";
import { AppIcon } from "./AppIcon";

export interface OutputSettingsDialogProps {
  routing: OutputRoutingController;
  localOutput: AudioOutputController;
  onClose(): void;
}

export function OutputSettingsDialog({
  routing,
  localOutput,
  onClose,
}: OutputSettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [onClose]);

  async function chooseDevice(): Promise<void> {
    setDeviceBusy(true);
    try {
      await localOutput.selectDevice();
    } catch {
      // The controller exposes the browser or permission error inline.
    } finally {
      setDeviceBusy(false);
    }
  }

  async function useDefaultDevice(): Promise<void> {
    setDeviceBusy(true);
    try {
      await localOutput.useSystemDefault();
    } catch {
      // The controller exposes the browser or permission error inline.
    } finally {
      setDeviceBusy(false);
    }
  }

  const serverReady = routing.connectionStatus === "connected" && routing.serverState?.connected;
  const platformLabel = routing.serverState?.platform || "server";

  return (
    <div ref={dialogRef} className="output-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="output-settings-title">
      <header className="output-settings-dialog__topbar">
        <div>
          <p className="eyebrow">Playback routing</p>
          <h1 id="output-settings-title">Audio output</h1>
        </div>
        <button ref={closeRef} className="icon-button" type="button" aria-label="Close audio output settings" onClick={onClose}>
          <AppIcon name="close" />
        </button>
      </header>

      <div className="output-settings-dialog__content">
        <section className="output-route-section" aria-labelledby="output-route-title">
          <div className="output-settings-heading">
            <p className="eyebrow">Destination</p>
            <h2 id="output-route-title">Where should this session play?</h2>
          </div>
          <div className="output-route-cards">
            <button
              type="button"
              className={routing.route === "local" ? "is-active" : undefined}
              aria-pressed={routing.route === "local"}
              onClick={routing.useLocalOutput}
            >
              <span className="output-route-card__icon"><AppIcon name="output" /></span>
              <strong>This device</strong>
              <span>Audio stays in this browser and uses {localOutput.label.toLowerCase()}.</span>
            </button>
            <button
              type="button"
              className={routing.route === "server" ? "is-active" : undefined}
              aria-pressed={routing.route === "server"}
              disabled={!serverReady}
              onClick={routing.useServerOutput}
            >
              <span className="output-route-card__icon"><AppIcon name="visualizer" /></span>
              <strong>Server audio</strong>
              <span>The same Web service renders audio on {routing.serverName || "the host machine"}.</span>
            </button>
          </div>
        </section>

        <section className="output-device-section" aria-labelledby="local-output-title">
          <div className="output-settings-heading">
            <p className="eyebrow">Client device</p>
            <h2 id="local-output-title">This device’s speaker</h2>
            <p>{localOutput.label}</p>
          </div>
          <div className="output-settings-actions">
            <button className="button-with-icon" type="button" disabled={deviceBusy || !localOutput.supported} onClick={() => void chooseDevice()}>
              <AppIcon name="output" />
              {deviceBusy ? "Opening device picker…" : "Choose audio device"}
            </button>
            <button type="button" disabled={deviceBusy || !localOutput.deviceId} onClick={() => void useDefaultDevice()}>
              Use system default
            </button>
          </div>
          {!localOutput.supported ? (
            <p className="output-settings-note">
              This browser does not expose speaker selection. Use the operating system’s audio picker; playback on this device still works.
            </p>
          ) : null}
          {localOutput.error ? <p className="output-settings-error" role="alert">{localOutput.error}</p> : null}
        </section>

        <section className="server-output-section" aria-labelledby="server-output-title">
          <div className="output-settings-heading">
            <p className="eyebrow">Server device</p>
            <h2 id="server-output-title">Server audio output</h2>
            <p>
              This page discovers the audio renderer built into the same Web service automatically.
              It uses the current Navidrome session automatically, with no additional setup.
            </p>
          </div>
          <p className="output-connection-status" data-status={serverReady ? "connected" : routing.connectionStatus} role="status">
            {serverReady
              ? `${routing.serverName || "Server"} ready · ${platformLabel} · ${routing.serverState?.deviceBackend || "system audio"}`
              : routing.connectionStatus === "connecting"
                ? "Discovering server audio…"
                : "Server audio is unavailable"}
          </p>
          {serverReady ? (
            <div className="server-output-device">
              <label htmlFor="server-output-device">Server audio device</label>
              <div>
                <select
                  id="server-output-device"
                  value={routing.serverState?.selectedOutputDeviceId ?? ""}
                  disabled={!routing.serverState?.canSelectOutputDevice}
                  onChange={(event) => routing.selectServerDevice(event.currentTarget.value)}
                >
                  {(routing.serverState?.outputDevices ?? []).map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </select>
                <button type="button" onClick={routing.refreshServerDevices}>Refresh devices</button>
              </div>
              {!routing.serverState?.canSelectOutputDevice ? (
                <p className="output-settings-note">
                  This server currently uses its system default output. Platform-specific device selection can be added through the server audio adapter.
                </p>
              ) : null}
              {routing.serverState?.outputError ? (
                <p className="output-settings-error" role="alert">{routing.serverState.outputError}</p>
              ) : null}
            </div>
          ) : (
            <div className="output-settings-actions">
              <button className="button-with-icon" type="button" onClick={routing.reconnect}>
                <AppIcon name="retry" />
                Retry discovery
              </button>
            </div>
          )}
          {routing.error ? <p className="output-settings-error" role="alert">{routing.error}</p> : null}
        </section>

        <section className="output-server-section output-server-section--standalone" aria-label="Built-in server audio">
          <p className="eyebrow">One service, one login</p>
          <h2>Built into the Web server</h2>
          <code>npm run output-server</code>
          <p>
            Open the URL printed by the server and use the normal Navidrome login page.
            macOS currently uses CoreAudio; Linux and Windows backends plug into the same adapter contract.
          </p>
        </section>
      </div>
    </div>
  );
}
