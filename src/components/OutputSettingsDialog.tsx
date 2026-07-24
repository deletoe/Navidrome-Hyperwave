import { useEffect, useRef, useState } from "react";

import type { AudioOutputController } from "../hooks/useAudioPlayer";
import type { OutputRoutingController } from "../hooks/useOutputRouting";
import {
  STREAMING_BIT_RATE_OPTIONS,
  type ConnectionRoute,
  type StreamingMode,
  type StreamingPreferences,
} from "../lib/streamingPreferences";
import { AppIcon } from "./AppIcon";

export interface OutputSettingsDialogProps {
  routing: OutputRoutingController;
  localOutput: AudioOutputController;
  activeRoute?: ConnectionRoute;
  activeServerUrl: string;
  routeStatus: "stable" | "probing" | "switching";
  streamingPreferences: StreamingPreferences;
  onSetStreamingMode(mode: StreamingMode): void;
  onSetStreamingMaxBitRate(maxBitRate: number): void;
  onClose(): void;
}

type BrowserFamily = "chrome" | "edge" | "firefox" | "safari";

function detectBrowserFamily(userAgent: string): BrowserFamily {
  if (/\bEdg\//.test(userAgent)) return "edge";
  if (/\bFirefox\//.test(userAgent)) return "firefox";
  if (/\bSafari\//.test(userAgent) && !/\b(?:Chrome|Chromium|CriOS)\//.test(userAgent)) return "safari";
  return "chrome";
}

export function OutputSettingsDialog({
  routing,
  localOutput,
  activeRoute,
  activeServerUrl,
  routeStatus,
  streamingPreferences,
  onSetStreamingMode,
  onSetStreamingMaxBitRate,
  onClose,
}: OutputSettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    if (localOutput.supported) void localOutput.refreshDevices().catch(() => undefined);
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

  async function chooseDevice(deviceId: string): Promise<void> {
    setDeviceBusy(true);
    try {
      await localOutput.selectDevice(deviceId);
    } catch {
      // The controller exposes the browser or permission error inline.
    } finally {
      setDeviceBusy(false);
    }
  }

  async function discoverDevices(): Promise<void> {
    setDeviceBusy(true);
    try {
      await localOutput.refreshDevices(true);
    } catch {
      // The controller exposes permission or enumeration errors inline.
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
  const browserFamily = detectBrowserFamily(window.navigator.userAgent);

  return (
    <div ref={dialogRef} className="output-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="output-settings-title">
      <header className="output-settings-dialog__topbar">
        <div>
          <p className="eyebrow">Playback routing</p>
          <h1 id="output-settings-title">Audio & streaming</h1>
        </div>
        <button ref={closeRef} className="icon-button" type="button" aria-label="Close audio output settings" onClick={onClose}>
          <AppIcon name="close" />
        </button>
      </header>

      <div className="output-settings-dialog__content">
        <section className="stream-quality-section" aria-labelledby="stream-quality-title">
          <div className="output-settings-heading">
            <p className="eyebrow">Network quality</p>
            <h2 id="stream-quality-title">Streaming bitrate</h2>
            <p>
              Active route: <strong>{activeRoute === "internal" ? "internal network" : "external network"}</strong>
              {activeServerUrl ? <> · <code>{activeServerUrl}</code></> : null}
            </p>
            {routeStatus !== "stable" ? (
              <p role="status">
                {routeStatus === "probing"
                  ? "Checking whether the internal route is stable…"
                  : "Switching network route…"}
              </p>
            ) : null}
          </div>
          <fieldset className="stream-quality-modes">
            <legend>Quality policy</legend>
            <label>
              <input
                type="radio"
                name="streamingMode"
                checked={streamingPreferences.mode === "auto"}
                onChange={() => onSetStreamingMode("auto")}
              />
              <span>
                <strong>Automatic</strong>
                <small>Original quality internally; cap high-bitrate or unknown tracks externally.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="streamingMode"
                checked={streamingPreferences.mode === "original"}
                onChange={() => onSetStreamingMode("original")}
              />
              <span>
                <strong>Always original</strong>
                <small>Never ask Navidrome to transcode for bitrate.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="streamingMode"
                checked={streamingPreferences.mode === "limited"}
                onChange={() => onSetStreamingMode("limited")}
              />
              <span>
                <strong>Always limit</strong>
                <small>Apply the selected maximum on internal and external routes.</small>
              </span>
            </label>
          </fieldset>
          <label className="stream-quality-limit" htmlFor="stream-quality-limit">
            Maximum bitrate
            <select
              id="stream-quality-limit"
              value={streamingPreferences.maxBitRate}
              disabled={streamingPreferences.mode === "original"}
              onChange={(event) => onSetStreamingMaxBitRate(Number(event.currentTarget.value))}
            >
              {STREAMING_BIT_RATE_OPTIONS.map((bitRate) => (
                <option key={bitRate} value={bitRate}>{bitRate} kbps</option>
              ))}
            </select>
          </label>
          <p className="output-settings-note">
            Route changes are automatic and preserve the current queue. Automatic mode defaults to Opus 256 kbps on the external route. Browser playback also uses this compatibility fallback for ALAC; native server audio keeps the original stream unless the selected bitrate policy limits it.
          </p>
        </section>

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
          {localOutput.supported ? (
            <div className="server-output-device client-output-device">
              <label htmlFor="client-output-device">Client audio device</label>
              <div>
                <select
                  id="client-output-device"
                  value={localOutput.deviceId}
                  disabled={deviceBusy}
                  onChange={(event) => void chooseDevice(event.currentTarget.value)}
                >
                  <option value="">System default</option>
                  {localOutput.devices
                    .filter((device) => device.deviceId !== "default")
                    .map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                    ))}
                </select>
                <button className="button-with-icon" type="button" disabled={deviceBusy} onClick={() => void discoverDevices()}>
                  <AppIcon name="retry" />
                  {deviceBusy ? "Scanning…" : "Refresh client devices"}
                </button>
              </div>
              <p className="output-settings-note">
                If Chrome initially hides device names, refreshing the client list may ask for microphone permission.
                Audio is not recorded; the temporary permission stream is stopped immediately.
              </p>
            </div>
          ) : null}
          <div className="output-settings-actions">
            <button type="button" disabled={deviceBusy || !localOutput.deviceId} onClick={() => void useDefaultDevice()}>
              Use system default
            </button>
          </div>
          {!localOutput.supported ? (
            window.isSecureContext === false ? (
              <div className="output-settings-note insecure-origin-guide">
                <strong>Enable client audio devices on this HTTP address</strong>
                <p>Choose your browser. The matching instructions are expanded automatically.</p>
                <details open={browserFamily === "chrome"}>
                  <summary>Google Chrome</summary>
                  <ol>
                    <li>Open <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> in a new tab.</li>
                    <li>Add this exact origin: <code>{window.location.origin}</code></li>
                    <li>Set the flag to Enabled, then relaunch Chrome.</li>
                  </ol>
                </details>
                <details open={browserFamily === "edge"}>
                  <summary>Microsoft Edge</summary>
                  <ol>
                    <li>Open <code>edge://flags/#unsafely-treat-insecure-origin-as-secure</code> in a new tab.</li>
                    <li>Add this exact origin: <code>{window.location.origin}</code></li>
                    <li>Set the flag to Enabled, then relaunch Edge.</li>
                  </ol>
                </details>
                <details open={browserFamily === "firefox"}>
                  <summary>Mozilla Firefox</summary>
                  <ol>
                    <li>Open <code>about:config</code> and accept the warning.</li>
                    <li>Create or edit the String preference <code>dom.securecontext.allowlist</code>.</li>
                    <li>Add this hostname to its comma-separated value: <code>{window.location.hostname}</code>, then reload this page.</li>
                  </ol>
                  <small>Firefox applies this exception to every port on this hostname, not only this app.</small>
                </details>
                <details open={browserFamily === "safari"}>
                  <summary>Apple Safari</summary>
                  <p>Safari has no equivalent HTTP secure-origin override. Use HTTPS instead. In-page speaker selection requires Safari 18.4 or later on macOS; on iPhone and iPad, use the system audio controls.</p>
                </details>
                <small>These overrides weaken browser protections. Only use them for an address you trust on your local network.</small>
              </div>
            ) : (
              <p className="output-settings-note">
                This browser does not expose speaker selection. Playback on this device still works through the system default.
              </p>
            )
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
