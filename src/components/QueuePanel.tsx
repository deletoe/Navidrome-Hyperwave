import { useEffect, useId, useRef, type Dispatch } from "react";

import { formatDuration } from "../lib/format";
import type { QueueAction, QueueState, RepeatMode } from "../state/playerQueue";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";

export interface QueuePanelProps {
  queuePanelId: string;
  state: QueueState;
  open: boolean;
  coverUrl?: (coverArt?: string, size?: number) => string;
  onClose: () => void;
  onSelectAndPlay: (index: number) => void;
  dispatch: Dispatch<QueueAction>;
}

const repeatSequence: RepeatMode[] = ["off", "all", "one"];

export function QueuePanel({
  queuePanelId,
  state,
  open,
  coverUrl,
  onClose,
  onSelectAndPlay,
  dispatch,
}: QueuePanelProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const returnFocus = returnFocusRef.current;
        returnFocusRef.current = null;
        if (returnFocus?.isConnected) returnFocus.focus();
      }
      return;
    }

    wasOpenRef.current = true;
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      !panelRef.current?.contains(activeElement)
    ) {
      returnFocusRef.current = activeElement;
    }
    closeRef.current?.focus();

    function containKeyboardFocus(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
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
      } else if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", containKeyboardFocus);
    return () => document.removeEventListener("keydown", containKeyboardFocus);
  }, [open]);

  function cycleRepeat(): void {
    const index = repeatSequence.indexOf(state.repeatMode);
    dispatch({ type: "setRepeat", mode: repeatSequence[(index + 1) % repeatSequence.length]! });
  }

  return (
    <aside
      ref={panelRef}
      id={queuePanelId}
      className="queue-panel"
      data-open={open}
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-labelledby={headingId}
    >
      <header className="queue-panel__heading">
        <div>
          <p className="eyebrow">Up next</p>
          <h2 id={headingId}>Playback queue</h2>
        </div>
        {open ? (
          <button
            className="icon-button"
            ref={closeRef}
            type="button"
            aria-label="Close playback queue"
            title="Close playback queue"
            onClick={() => onCloseRef.current()}
          >
            <AppIcon name="close" />
          </button>
        ) : null}
      </header>

      <div className="queue-panel__modes" aria-label="Queue modes">
        <button
          className="button-with-icon button-with-icon--compact"
          type="button"
          aria-pressed={state.shuffle}
          aria-label={`Shuffle ${state.shuffle ? "on" : "off"}`}
          disabled={state.tracks.length < 2}
          onClick={() => dispatch({ type: "shuffle" })}
        >
          <AppIcon name="shuffle" />
          Shuffle
        </button>
        <button
          className="button-with-icon button-with-icon--compact"
          type="button"
          aria-label={`Repeat mode ${state.repeatMode}`}
          title={`Repeat mode: ${state.repeatMode}`}
          data-repeat-mode={state.repeatMode}
          onClick={cycleRepeat}
        >
          <AppIcon name={state.repeatMode === "one" ? "repeatOne" : "repeat"} />
          Repeat
        </button>
        <button
          className="button-with-icon button-with-icon--compact"
          type="button"
          aria-label="Clear queue"
          disabled={state.tracks.length === 0}
          onClick={() => dispatch({ type: "clear" })}
        >
          <AppIcon name="trash" />
          Clear
        </button>
      </div>

      {state.tracks.length === 0 ? (
        <div className="inline-state inline-state--empty">
          <h3>The queue is empty</h3>
          <p>Use Add to queue beside any song, or play a full album or genre.</p>
          {open ? (
            <button className="button-with-icon" type="button" onClick={onClose}>
              <AppIcon name="back" />
              Return to the archive
            </button>
          ) : null}
        </div>
      ) : (
        <ol className="queue-list">
          {state.tracks.map((track, index) => {
            const current = index === state.currentIndex;
            return (
              <li
                key={state.occurrenceKeys?.[index] ?? `${track.id}-${index}`}
                data-current={current || undefined}
              >
                <button
                  className="queue-list__select"
                  type="button"
                  aria-label={`Play ${track.title} from queue`}
                  aria-current={current ? "true" : undefined}
                  onClick={() => onSelectAndPlay(index)}
                >
                  <span className="queue-list__visual" aria-hidden="true">
                    <Artwork
                      className="queue-list__artwork"
                      src={coverUrl?.(track.coverArt, 96)}
                      alt=""
                      decorative
                    />
                    <span className="queue-list__index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </span>
                  <span>
                    <strong>{track.title}</strong>
                    <span>{track.displayArtist || track.artist || "Unknown artist"}</span>
                  </span>
                  <time dateTime={`PT${track.duration ?? 0}S`}>
                    {formatDuration(track.duration)}
                  </time>
                </button>
                <button
                  className="queue-list__remove icon-button"
                  type="button"
                  aria-label={`Remove ${track.title} from queue`}
                  title={`Remove ${track.title} from queue`}
                  onClick={() => dispatch({ type: "remove", index })}
                >
                  <AppIcon name="trash" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
