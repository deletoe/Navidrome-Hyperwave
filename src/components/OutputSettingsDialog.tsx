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
              className={routing.route === "remote" ? "is-active" : undefined}
              aria-pressed={routing.route === "remote"}
              disabled={routing.connectionStatus !== "connected"}
              onClick={routing.useRemoteOutput}
            >
              <span className="output-route-card__icon"><AppIcon name="visualizer" /></span>
              <strong>{routing.remoteName ? `${routing.remoteName} · Mac` : "Mac playback service"}</strong>
              <span>The phone becomes a remote; the Mac fetches and plays the track itself.</span>
            </button>
          </div>
        </section>

        <section className="output-device-section" aria-labelledby="local-output-title">
          <div className="output-settings-heading">
            <p className="eyebrow">Client output</p>
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
              This browser does not expose speaker selection. Use Android, Bluetooth, or Control Center’s system audio picker; playback on this device still works.
            </p>
          ) : null}
          {localOutput.error ? <p className="output-settings-error" role="alert">{localOutput.error}</p> : null}
        </section>

        <section className="remote-output-section" aria-labelledby="remote-output-title">
          <div className="output-settings-heading">
            <p className="eyebrow">LAN renderer</p>
            <h2 id="remote-output-title">Connect to a Mac playback service</h2>
            <p>The Mac service must already be connected to the same Navidrome server.</p>
          </div>
          <div className="remote-output-form">
            <label htmlFor="remote-output-address">Mac address</label>
            <input
              id="remote-output-address"
              type="text"
              inputMode="url"
              placeholder="http://192.168.1.20:17856"
              value={routing.endpoint}
              onChange={(event) => routing.setEndpoint(event.currentTarget.value)}
            />
            <label htmlFor="remote-output-pin">Six-digit pairing code</label>
            <input
              id="remote-output-pin"
              className="remote-output-form__pin"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={routing.pairingCode}
              onChange={(event) => routing.setPairingCode(event.currentTarget.value)}
            />
            <div className="output-settings-actions">
              {routing.connectionStatus === "connected" ? (
                <button type="button" onClick={routing.disconnect}>Disconnect</button>
              ) : (
                <button className="button-with-icon" type="button" disabled={routing.connectionStatus === "connecting"} onClick={routing.connect}>
                  <AppIcon name={routing.connectionStatus === "connecting" ? "loading" : "connect"} className={routing.connectionStatus === "connecting" ? "is-spinning" : ""} />
                  {routing.connectionStatus === "connecting" ? "Pairing…" : "Pair with Mac"}
                </button>
              )}
              {routing.connectionStatus === "connected" && routing.route !== "remote" ? (
                <button type="button" onClick={routing.useRemoteOutput}>Use this Mac</button>
              ) : null}
            </div>
          </div>
          <p className="output-connection-status" data-status={routing.connectionStatus} role="status">
            {routing.connectionStatus === "connected"
              ? `${routing.remoteName || "Mac"} paired${routing.remoteState?.connected ? " and ready" : "; open its renderer and connect Navidrome"}`
              : routing.connectionStatus === "connecting" ? "Contacting the Mac playback service…" : "Not paired"}
          </p>
          {routing.connectionStatus === "connected" ? (
            <div className="remote-output-device">
              <label htmlFor="remote-output-device">Mac audio device</label>
              <div>
                <select
                  id="remote-output-device"
                  value={routing.remoteState?.selectedOutputDeviceId ?? ""}
                  onChange={(event) => routing.selectRemoteDevice(event.currentTarget.value)}
                >
                  <option value="">System default</option>
                  {(routing.remoteState?.outputDevices ?? []).map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </select>
                <button type="button" onClick={routing.refreshRemoteDevices}>Refresh devices</button>
              </div>
              <p className="output-settings-note">The standalone server changes the Mac’s current system output so CoreAudio playback follows this choice.</p>
              {routing.remoteState?.outputError ? (
                <p className="output-settings-error" role="alert">{routing.remoteState.outputError}</p>
              ) : null}
            </div>
          ) : null}
          {routing.error ? <p className="output-settings-error" role="alert">{routing.error}</p> : null}
        </section>

        <section className="output-server-section output-server-section--standalone" aria-label="Standalone output server">
          <p className="eyebrow">Server-side renderer</p>
          <h2>No Mac App required</h2>
          <code>npm run output-server</code>
          <p>The standalone server owns the Mac audio device and Navidrome connection. Its terminal prints the phone address and pairing code.</p>
        </section>
      </div>
    </div>
  );
}
