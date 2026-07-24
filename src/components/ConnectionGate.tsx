import { useState, type FormEvent } from "react";

import { isDesktopApp } from "../desktop";
import type { ConnectionInput } from "../hooks/useNavidrome";
import type { AuthMode } from "../types";
import { AppIcon } from "./AppIcon";
import { HeroMedia } from "./HeroMedia";

export interface ConnectionGateProps {
  rememberedInternalServerUrl: string;
  rememberedExternalServerUrl: string;
  rememberedUsername: string;
  isConnecting: boolean;
  error?: string;
  themeAsset?: string;
  onConnect: (input: ConnectionInput) => void | Promise<void>;
}
export function ConnectionGate({
  rememberedInternalServerUrl,
  rememberedExternalServerUrl,
  rememberedUsername,
  isConnecting,
  error,
  themeAsset = "",
  onConnect,
}: ConnectionGateProps) {
  const desktop = isDesktopApp();
  const [internalServerUrl, setInternalServerUrl] = useState(rememberedInternalServerUrl);
  const [externalServerUrl, setExternalServerUrl] = useState(rememberedExternalServerUrl);
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const auth =
      authMode === "password"
        ? { type: "password" as const, username, password }
        : { type: "apiKey" as const, apiKey };
    void onConnect({ internalServerUrl, externalServerUrl, auth });
  }

  return (
    <main className="connection-gate">
      <section className="connection-gate__panel" aria-labelledby="connection-title">
        <p className="eyebrow">My Navidrome 5.6</p>
        <h1 id="connection-title">Connect your archive</h1>
        <p>
          Open your personal music library in this {desktop ? "Mac app" : "browser"}. Your secret stays in memory for this
          session and is never saved by this app.
        </p>

        <form className="connection-form" onSubmit={submit}>
          <div className="connection-form__address">
            <label htmlFor="internal-server-address">Internal network address</label>
            <input
              id="internal-server-address"
              name="internalServerUrl"
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="http://192.168.1.20:4533"
              value={internalServerUrl}
              onChange={(event) => setInternalServerUrl(event.currentTarget.value)}
            />
            <small>Preferred when reachable. Streams use the source quality by default.</small>
          </div>

          <div className="connection-form__address">
            <label htmlFor="external-server-address">External network address</label>
            <input
              id="external-server-address"
              name="externalServerUrl"
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="https://music.example.com"
              value={externalServerUrl}
              onChange={(event) => setExternalServerUrl(event.currentTarget.value)}
            />
            <small>Used when the internal address is blank or unavailable. High-bitrate tracks default to 256 kbps.</small>
          </div>
          <p className="connection-form__route-note">Fill either address or both. When both are present, the internal route is tried first.</p>

          <fieldset>
            <legend>Authentication</legend>
            <label>
              <input
                type="radio"
                name="authMode"
                value="password"
                checked={authMode === "password"}
                onChange={() => setAuthMode("password")}
              />
              Username and password
            </label>
            <label>
              <input
                type="radio"
                name="authMode"
                value="apiKey"
                checked={authMode === "apiKey"}
                onChange={() => setAuthMode("apiKey")}
              />
              API key
            </label>
          </fieldset>

          {authMode === "password" ? (
            <div className="connection-form__credentials">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />
            </div>
          ) : (
            <div className="connection-form__credentials">
              <label htmlFor="api-key">API key</label>
              <input
                id="api-key"
                name="apiKey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.currentTarget.value)}
                required
              />
            </div>
          )}

          {error ? (
            <div className="connection-form__error" role="alert">
              <strong>Connection failed</strong>
              <p>{error}</p>
              <p>
                {desktop
                  ? "Check the server address, protocol, and network connection."
                  : "Check the address, browser access, protocol, and Navidrome CORS settings."}
              </p>
            </div>
          ) : null}

          <button className="button-with-icon" type="submit" disabled={isConnecting}>
            <AppIcon name={isConnecting ? "loading" : "connect"} className={isConnecting ? "is-spinning" : ""} />
            {isConnecting ? "Connecting…" : "Connect to archive"}
          </button>
          {isConnecting ? <p role="status">Contacting your Navidrome server…</p> : null}
        </form>
      </section>
      <aside className="connection-gate__signal" aria-label="Session privacy">
        <HeroMedia asset={themeAsset} className="hero-media--connection" />
        <span aria-hidden="true">56</span>
        <h2>Private listening session</h2>
        <p>Only the normalized internal/external addresses and username may be remembered.</p>
      </aside>
    </main>
  );
}
