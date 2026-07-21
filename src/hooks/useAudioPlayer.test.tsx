import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubsonicClient } from "../lib/subsonic";
import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from "../lib/audioPreferences";
import {
  createInitialQueueState,
  queueReducer,
  type QueueState,
} from "../state/playerQueue";
import type { Track } from "../types";
import {
  getScrobbleThreshold,
  PLAYBACK_FADE_IN_MS,
  PLAYBACK_FADE_OUT_MS,
  useAudioPlayer,
  type AudioPlayerController,
} from "./useAudioPlayer";
import { useNavidrome } from "./useNavidrome";

const song: Track = {
  id: "song-1",
  title: "Signal One",
  artist: "Test Artist",
  album: "Test Album",
  duration: 180,
};

const client = {
  streamUrl: vi.fn((id: string) => `http://music.test/stream/${id}`),
  coverArtUrl: vi.fn((id: string) => `http://music.test/cover/${id}`),
  scrobble: vi.fn(async () => undefined),
} as unknown as SubsonicClient;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Harness({
  currentTrack,
  activeClient = client,
  visualizerEnabled = false,
  audioPreferences,
  repeatMode = "off",
  onController,
}: {
  currentTrack?: Track;
  activeClient?: SubsonicClient;
  visualizerEnabled?: boolean;
  audioPreferences?: AudioPreferences;
  repeatMode?: QueueState["repeatMode"];
  onController?: (controller: AudioPlayerController) => void;
}) {
  const [, dispatch] = useReducer(queueReducer, createInitialQueueState());
  const queueState = currentTrack
    ? ({
        tracks: [currentTrack],
        currentIndex: 0,
        repeatMode,
        shuffle: false,
      } satisfies QueueState)
    : createInitialQueueState();
  const player = useAudioPlayer({
    client: activeClient,
    currentTrack,
    queueState,
    dispatch,
    visualizerEnabled,
    audioPreferences,
  });
  onController?.(player);

  return (
    <div>
      <audio ref={player.audioRef} data-testid="audio" />
      <button type="button" onClick={() => void player.play()}>
        play
      </button>
      <output>{player.volume}</output>
    </div>
  );
}

function QueueOccurrenceHarness({
  queueState,
  activeClient,
}: {
  queueState: QueueState;
  activeClient: SubsonicClient;
}) {
  const [, dispatch] = useReducer(queueReducer, createInitialQueueState());
  const currentTrack = queueState.tracks[queueState.currentIndex];
  const player = useAudioPlayer({ client: activeClient, currentTrack, queueState, dispatch });

  return (
    <div>
      <audio ref={player.audioRef} data-testid="occurrence-audio" />
      <button type="button" onClick={() => void player.play()}>
        play occurrence
      </button>
    </div>
  );
}

describe("useAudioPlayer", () => {
  it("pauses and removes the media source when the queue becomes empty", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const load = vi.spyOn(HTMLMediaElement.prototype, "load");
    const removeAttribute = vi.spyOn(HTMLMediaElement.prototype, "removeAttribute");
    const { rerender } = render(<Harness currentTrack={song} />);

    rerender(<Harness currentTrack={undefined} />);

    expect(pause).toHaveBeenCalled();
    expect(removeAttribute).toHaveBeenCalledWith("src");
    expect(load).toHaveBeenCalled();
  });

  it("does not rebuild the stream URL for an unchanged track", () => {
    vi.mocked(client.streamUrl).mockClear();
    const { rerender } = render(<Harness currentTrack={song} />);

    rerender(<Harness currentTrack={{ ...song }} />);

    expect(client.streamUrl).toHaveBeenCalledTimes(1);
  });

  it("starts playback from an explicit user action", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const view = render(<Harness currentTrack={song} />);

    await act(async () => {
      view.getByRole("button", { name: "play" }).click();
    });

    expect(play).toHaveBeenCalled();
  });

  it("fades playback in without changing the user's volume setting", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const audio = view.getByTestId("audio") as HTMLAudioElement;

      await act(async () => {
        await player.play();
      });
      expect(player.isPlaying).toBe(true);
      expect(player.volume).toBe(0.86);
      expect(audio.volume).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS / 2);
      });
      expect(audio.volume).toBeGreaterThan(0);
      expect(audio.volume).toBeLessThan(0.86);

      act(() => player.setVolume(0.4));
      expect(player.volume).toBe(0.4);
      expect(audio.volume).toBeGreaterThan(0);
      expect(audio.volume).toBeLessThan(0.4);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS);
      });
      expect(audio.volume).toBeCloseTo(0.4, 5);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fades out before pausing the native media element", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const audio = view.getByTestId("audio") as HTMLAudioElement;
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + 16);
      });
      expect(audio.volume).toBeCloseTo(0.86, 5);

      act(() => player.pause());
      expect(player.isPlaying).toBe(false);
      expect(pause).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_OUT_MS / 2);
      });
      expect(audio.volume).toBeGreaterThan(0);
      expect(audio.volume).toBeLessThan(0.86);
      expect(pause).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_OUT_MS);
      });
      expect(pause).toHaveBeenCalledOnce();
      expect(audio.volume).toBeCloseTo(0.86, 5);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reverses an in-flight fade-out without a stale pause", async () => {
    vi.useFakeTimers();
    try {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const audio = view.getByTestId("audio") as HTMLAudioElement;
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + 16);
      });

      act(() => player.pause());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_OUT_MS / 2);
      });
      const fadedVolume = audio.volume;
      expect(fadedVolume).toBeGreaterThan(0);
      expect(fadedVolume).toBeLessThan(0.86);

      await act(async () => {
        await player.play();
      });
      expect(player.isPlaying).toBe(true);
      expect(audio.volume).toBeCloseTo(fadedVolume, 5);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + PLAYBACK_FADE_OUT_MS);
      });
      expect(play).toHaveBeenCalledTimes(2);
      expect(pause).not.toHaveBeenCalled();
      expect(audio.volume).toBeCloseTo(0.86, 5);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a cancelled pending play from starting after toggle", async () => {
    vi.useFakeTimers();
    try {
      let resolvePlay!: () => void;
      const pendingNativePlay = new Promise<void>((resolve) => {
        resolvePlay = resolve;
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(pendingNativePlay);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const pendingPlay = player.play();

      await act(async () => {
        await player.toggle();
      });
      expect(player.isPlaying).toBe(false);
      expect(pause).toHaveBeenCalledOnce();

      await act(async () => {
        resolvePlay();
        await pendingPlay;
      });
      expect(player.isPlaying).toBe(false);
      expect(player.error).toBeUndefined();
      expect(pause).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes a pending fade-out immediately when the page becomes hidden", async () => {
    vi.useFakeTimers();
    try {
      const visibilityState = vi
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("visible");
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + 16);
      });

      act(() => player.pause());
      expect(pause).not.toHaveBeenCalled();
      visibilityState.mockReturnValue("hidden");
      act(() => document.dispatchEvent(new Event("visibilitychange")));

      expect(pause).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes a fade-in at the target volume when the page becomes hidden", async () => {
    vi.useFakeTimers();
    try {
      const visibilityState = vi
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("visible");
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const audio = view.getByTestId("audio") as HTMLAudioElement;
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS / 2);
      });
      expect(audio.volume).toBeGreaterThan(0);
      expect(audio.volume).toBeLessThan(0.86);

      visibilityState.mockReturnValue("hidden");
      act(() => document.dispatchEvent(new Event("visibilitychange")));

      expect(audio.volume).toBeCloseTo(0.86, 5);
      expect(player.isPlaying).toBe(true);
      expect(pause).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a newer fade-out finish when a reversed play promise resolves late", async () => {
    vi.useFakeTimers();
    try {
      let resolveReversedPlay!: () => void;
      const reversedPlay = new Promise<void>((resolve) => {
        resolveReversedPlay = resolve;
      });
      vi.spyOn(HTMLMediaElement.prototype, "play")
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(reversedPlay);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const audio = view.getByTestId("audio") as HTMLAudioElement;
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + 16);
      });

      act(() => player.pause());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_OUT_MS / 2);
      });
      let reversedAttempt!: Promise<void>;
      act(() => {
        reversedAttempt = player.play();
      });
      act(() => player.pause());
      const secondFadeVolume = audio.volume;
      expect(secondFadeVolume).toBeGreaterThan(0);
      expect(pause).not.toHaveBeenCalled();

      await act(async () => {
        resolveReversedPlay();
        await reversedAttempt;
      });
      expect(pause).not.toHaveBeenCalled();
      expect(audio.volume).toBeCloseTo(secondFadeVolume, 5);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_OUT_MS + 16);
      });
      expect(pause).toHaveBeenCalledOnce();
      expect(audio.volume).toBeCloseTo(0.86, 5);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses immediately when the player is already silent", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + 16);
      });

      act(() => player.setVolume(0));
      act(() => player.pause());
      expect(pause).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      act(() => player.setVolume(0.5));
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS + 16);
      });
      act(() => player.toggleMute());
      expect((view.getByTestId("audio") as HTMLAudioElement).muted).toBe(true);
      act(() => player.pause());
      expect(pause).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the fade envelope when continuous playback changes tracks", async () => {
    vi.useFakeTimers();
    try {
      const nextClient = navidromeClient();
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          activeClient={nextClient}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      const audio = view.getByTestId("audio") as HTMLAudioElement;
      await act(async () => {
        await player.play();
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS / 2);
      });
      expect(audio.volume).toBeGreaterThan(0);
      expect(audio.volume).toBeLessThan(0.86);

      const secondSong = { ...song, id: "song-2", title: "Signal Two" };
      await act(async () => {
        view.rerender(
          <Harness
            currentTrack={secondSong}
            activeClient={nextClient}
            onController={(controller) => {
              player = controller;
            }}
          />,
        );
        await Promise.resolve();
      });

      expect(play).toHaveBeenCalledTimes(2);
      expect(player.isPlaying).toBe(true);
      expect(audio.volume).toBeCloseTo(0.86, 5);
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAYBACK_FADE_IN_MS * 2);
      });
      expect(audio.volume).toBeCloseTo(0.86, 5);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels playback fade timers when the player unmounts", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
      let player!: AudioPlayerController;
      const view = render(
        <Harness
          currentTrack={song}
          onController={(controller) => {
            player = controller;
          }}
        />,
      );
      await act(async () => {
        await player.play();
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
      expect(pause).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rolls back playback state when repeat-one is rejected", async () => {
    const repeatError = new Error("Repeat was blocked");
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(repeatError);
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={song}
        repeatMode="one"
        onController={(controller) => {
          player = controller;
        }}
      />,
    );

    await act(async () => {
      view.getByRole("button", { name: "play" }).click();
    });
    expect(player.isPlaying).toBe(true);

    act(() => player.handleEnded());

    await waitFor(() => expect(player.error).toBe(repeatError.message));
    expect(player.isPlaying).toBe(false);
    expect(player.progress).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the stream URL when the client session changes", () => {
    const firstClient = navidromeClient({
      streamUrl: vi.fn((id) => `http://first.test/${id}`),
    });
    const secondClient = navidromeClient({
      streamUrl: vi.fn((id) => `http://second.test/${id}`),
    });
    const view = render(<Harness currentTrack={song} activeClient={firstClient} />);

    view.rerender(<Harness currentTrack={{ ...song }} activeClient={secondClient} />);

    expect(secondClient.streamUrl).toHaveBeenCalledWith(song.id);
    expect(view.getByTestId("audio")).toHaveAttribute("src", `http://second.test/${song.id}`);
  });

  it("scrobbles the next track when continuous playback advances", async () => {
    const nextClient = navidromeClient();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const view = render(<Harness currentTrack={song} activeClient={nextClient} />);
    await act(async () => {
      view.getByRole("button", { name: "play" }).click();
    });
    await waitFor(() => expect(nextClient.scrobble).toHaveBeenCalledWith(song.id, false));

    const second = { ...song, id: "song-2", title: "Signal Two" };
    view.rerender(<Harness currentTrack={second} activeClient={nextClient} />);

    await waitFor(() => expect(nextClient.scrobble).toHaveBeenCalledWith(second.id, false));
  });

  it("reloads, resumes, and scrobbles adjacent occurrences with the same track id", async () => {
    const nextClient = navidromeClient();
    const load = vi.spyOn(HTMLMediaElement.prototype, "load");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const duplicateQueue = {
      tracks: [song, song],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
      occurrenceKeys: [1, 2],
      nextOccurrenceKey: 2,
    } as QueueState;
    const view = render(
      <QueueOccurrenceHarness queueState={duplicateQueue} activeClient={nextClient} />,
    );

    await act(async () => {
      view.getByRole("button", { name: "play occurrence" }).click();
    });
    await waitFor(() => expect(nextClient.scrobble).toHaveBeenCalledTimes(1));

    view.rerender(
      <QueueOccurrenceHarness
        queueState={{ ...duplicateQueue, currentIndex: 1 }}
        activeClient={nextClient}
      />,
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(play).toHaveBeenCalledTimes(2);
    expect(nextClient.scrobble).toHaveBeenNthCalledWith(2, song.id, false);
  });

  it("creates one MediaElementSource and reuses it across concurrent activation and track changes", async () => {
    const webAudio = installAudioContext();
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={song}
        visualizerEnabled
        onController={(controller) => {
          player = controller;
        }}
      />,
    );

    await act(async () => {
      await Promise.all([player.visualizer.activate(), player.visualizer.activate()]);
    });
    await act(async () => {
      await player.visualizer.activate();
    });

    const context = webAudio.instances[0]!;
    expect(webAudio.instances).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(webAudio.source.connect).toHaveBeenCalledWith(webAudio.gains[0]);
    expect(webAudio.merger.connect).toHaveBeenCalledWith(webAudio.analyser);
    expect(webAudio.analyser.connect).toHaveBeenCalledWith(context.destination);
    expect(player.visualizer.status).toBe("ready");

    const frame = player.visualizer.readFrame();
    expect(frame?.frequency).toHaveLength(128);
    expect(frame?.waveform).toHaveLength(256);
    expect(webAudio.analyser.getByteFrequencyData).toHaveBeenCalledOnce();
    expect(webAudio.analyser.getByteTimeDomainData).toHaveBeenCalledOnce();

    act(() => {
      context.state = "suspended";
      (context as unknown as AudioContext).onstatechange?.(new Event("statechange"));
    });
    expect(player.visualizer.status).toBe("waiting");
    act(() => {
      context.state = "running";
      (context as unknown as AudioContext).onstatechange?.(new Event("statechange"));
    });
    expect(player.visualizer.status).toBe("ready");

    view.rerender(
      <Harness
        currentTrack={{ ...song, id: "song-2" }}
        visualizerEnabled
        onController={(controller) => {
          player = controller;
        }}
      />,
    );
    await act(async () => {
      await player.visualizer.activate();
    });

    expect(context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(webAudio.instances).toHaveLength(1);
  });

  it("applies EQ headroom and continuously blends hard-panned stereo channels", async () => {
    const webAudio = installAudioContext();
    let player!: AudioPlayerController;
    const bandGains = [6, 4, 2, 0, -1, 0, 1, 2, 3, 4];
    const preferences: AudioPreferences = {
      ...DEFAULT_AUDIO_PREFERENCES,
      eqEnabled: true,
      preset: "custom",
      preampDb: 2,
      bandGains,
      stereoBlend: 50,
    };
    const view = render(
      <Harness
        currentTrack={song}
        audioPreferences={preferences}
        onController={(controller) => { player = controller; }}
      />,
    );

    await act(async () => player.audioProcessing.activate());

    expect(player.visualizer.status).toBe("off");
    expect(player.audioProcessing.status).toBe("ready");
    expect(webAudio.filters).toHaveLength(10);
    expect(webAudio.filters.map((filter) => filter.type)).toEqual(Array(10).fill("peaking"));
    expect(webAudio.filters.map((filter) => filter.gain.value)).toEqual(bandGains);
    expect(webAudio.gains[0]!.gain.value).toBeCloseTo(Math.pow(10, -4 / 20));
    expect(webAudio.gains[2]!.gain.value).toBe(0.75);
    expect(webAudio.gains[3]!.gain.value).toBe(0.75);
    expect(webAudio.gains[4]!.gain.value).toBe(0.25);
    expect(webAudio.gains[5]!.gain.value).toBe(0.25);

    view.rerender(
      <Harness
        currentTrack={song}
        audioPreferences={{ ...preferences, stereoBlend: 100 }}
        onController={(controller) => { player = controller; }}
      />,
    );

    await waitFor(() => {
      expect(webAudio.gains[2]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5, 0, 0.015);
      expect(webAudio.gains[4]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5, 0, 0.015);
    });
  });

  it("smoothly bypasses EQ and restores original stereo without rebuilding the graph", async () => {
    const webAudio = installAudioContext();
    let player!: AudioPlayerController;
    const enabled: AudioPreferences = {
      ...DEFAULT_AUDIO_PREFERENCES,
      eqEnabled: true,
      preset: "bass",
      bandGains: [5, 4, 3, 1.5, 0, -1, -1.5, -1, 0, 1],
      stereoBlend: 100,
    };
    const view = render(
      <Harness
        currentTrack={song}
        audioPreferences={enabled}
        onController={(controller) => { player = controller; }}
      />,
    );
    await act(async () => player.audioProcessing.activate());

    view.rerender(
      <Harness
        currentTrack={song}
        audioPreferences={{ ...enabled, eqEnabled: false, stereoBlend: 0 }}
        onController={(controller) => { player = controller; }}
      />,
    );

    await waitFor(() => expect(player.audioProcessing.status).toBe("off"));
    expect(webAudio.instances[0]!.createMediaElementSource).toHaveBeenCalledOnce();
    expect(webAudio.gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.015);
    for (const filter of webAudio.filters) {
      expect(filter.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.015);
    }
    expect(webAudio.gains[2]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.015);
    expect(webAudio.gains[4]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.015);
  });

  it("uses the latest tuning values when AudioContext activation finishes late", async () => {
    let releaseResume!: () => void;
    const resumePromise = new Promise<void>((resolve) => { releaseResume = resolve; });
    const webAudio = installAudioContext({ resumePromise });
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={song}
        audioPreferences={DEFAULT_AUDIO_PREFERENCES}
        onController={(controller) => { player = controller; }}
      />,
    );

    const activation = player.audioProcessing.activate();
    view.rerender(
      <Harness
        currentTrack={song}
        audioPreferences={{ ...DEFAULT_AUDIO_PREFERENCES, stereoBlend: 100 }}
        onController={(controller) => { player = controller; }}
      />,
    );
    await act(async () => {
      releaseResume();
      await activation;
    });

    expect(player.audioProcessing.status).toBe("ready");
    expect(webAudio.gains[2]!.gain.value).toBe(0.5);
    expect(webAudio.gains[4]!.gain.value).toBe(0.5);
  });

  it("samples Web Audio only once for consumers in the same animation frame", async () => {
    const webAudio = installAudioContext();
    let player!: AudioPlayerController;
    render(
      <Harness
        currentTrack={song}
        visualizerEnabled
        onController={(controller) => {
          player = controller;
        }}
      />,
    );
    await act(async () => {
      await player.visualizer.activate();
    });

    const firstFrame = player.visualizer.readFrame(1_000);
    const sharedFrame = player.visualizer.readFrame(1_000);

    expect(sharedFrame).toBe(firstFrame);
    expect(webAudio.analyser.getByteFrequencyData).toHaveBeenCalledOnce();
    expect(webAudio.analyser.getByteTimeDomainData).toHaveBeenCalledOnce();

    player.visualizer.readFrame(1_001);
    expect(webAudio.analyser.getByteFrequencyData).toHaveBeenCalledTimes(2);
    expect(webAudio.analyser.getByteTimeDomainData).toHaveBeenCalledTimes(2);

    player.visualizer.readFrame();
    player.visualizer.readFrame();
    expect(webAudio.analyser.getByteFrequencyData).toHaveBeenCalledTimes(4);
    expect(webAudio.analyser.getByteTimeDomainData).toHaveBeenCalledTimes(4);
  });

  it("turns visualizer rendering off without closing or disconnecting its audio graph", async () => {
    const webAudio = installAudioContext();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={song}
        visualizerEnabled
        onController={(controller) => {
          player = controller;
        }}
      />,
    );
    await act(async () => {
      await player.visualizer.activate();
    });
    const context = webAudio.instances[0]!;

    view.rerender(
      <Harness
        currentTrack={song}
        visualizerEnabled={false}
        onController={(controller) => {
          player = controller;
        }}
      />,
    );
    await waitFor(() => expect(player.visualizer.status).toBe("off"));

    expect(context.close).not.toHaveBeenCalled();
    expect(webAudio.source.disconnect).not.toHaveBeenCalled();
    expect(webAudio.analyser.disconnect).not.toHaveBeenCalled();

    context.state = "suspended";
    await act(async () => {
      await player.play();
    });
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalled();
    expect(player.isPlaying).toBe(true);
  });

  it("keeps normal playback working when AudioContext construction fails", async () => {
    installAudioContext({ constructorError: new Error("audio device unavailable") });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    let player!: AudioPlayerController;
    render(
      <Harness
        currentTrack={song}
        visualizerEnabled
        onController={(controller) => {
          player = controller;
        }}
      />,
    );

    await act(async () => {
      await player.play();
    });

    expect(play).toHaveBeenCalledOnce();
    expect(player.isPlaying).toBe(true);
    expect(player.error).toBeUndefined();
    expect(player.visualizer.status).toBe("unavailable");
    expect(player.visualizer.error).toMatch(/could not be connected/i);
  });

  it("does not wait for a pending AudioContext resume before ordinary playback", async () => {
    let releaseResume!: () => void;
    const resumePromise = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });
    installAudioContext({ resumePromise });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    let player!: AudioPlayerController;
    render(
      <Harness
        currentTrack={song}
        visualizerEnabled
        onController={(controller) => {
          player = controller;
        }}
      />,
    );

    await act(async () => {
      await player.play();
    });

    expect(play).toHaveBeenCalledOnce();
    expect(player.isPlaying).toBe(true);
    expect(player.error).toBeUndefined();

    await act(async () => releaseResume());
    await waitFor(() => expect(player.visualizer.status).toBe("ready"));
  });

  it("retries visualizer activation after a stalled AudioContext resume", async () => {
    vi.useFakeTimers();
    try {
      const stalledResume = new Promise<void>(() => undefined);
      const webAudio = installAudioContext({
        resumePromises: [stalledResume, Promise.resolve()],
      });
      let player!: AudioPlayerController;
      render(
        <Harness
          currentTrack={song}
          visualizerEnabled
          onController={(controller) => {
            player = controller;
          }}
        />,
      );

      const firstActivation = player.visualizer.activate();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
        await firstActivation;
      });

      expect(player.visualizer.status).toBe("waiting");
      expect(webAudio.instances).toHaveLength(1);
      expect(webAudio.instances[0]!.close).toHaveBeenCalledOnce();

      await act(async () => {
        await player.visualizer.activate();
      });

      expect(webAudio.instances).toHaveLength(2);
      expect(player.visualizer.status).toBe("ready");
      expect(webAudio.instances[1]!.createMediaElementSource).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a stale play rejection after a newer track starts", async () => {
    let rejectFirstPlay!: (reason?: unknown) => void;
    const firstPlay = new Promise<void>((_resolve, reject) => {
      rejectFirstPlay = reject;
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockReturnValueOnce(firstPlay)
      .mockResolvedValue(undefined);
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={song}
        onController={(controller) => {
          player = controller;
        }}
      />,
    );

    const staleAttempt = player.play();
    const secondSong = { ...song, id: "song-2", title: "Signal Two" };
    view.rerender(
      <Harness
        currentTrack={secondSong}
        onController={(controller) => {
          player = controller;
        }}
      />,
    );
    await act(async () => {
      await player.play();
    });
    expect(player.isPlaying).toBe(true);

    await act(async () => {
      rejectFirstPlay(new DOMException("The play request was interrupted", "AbortError"));
      await staleAttempt;
    });

    expect(play).toHaveBeenCalledTimes(2);
    expect(player.isPlaying).toBe(true);
    expect(player.error).toBeUndefined();
  });

  it("removes Media Session handlers when the track is cleared", () => {
    const actionHandler = vi.fn();
    const original = Object.getOwnPropertyDescriptor(navigator, "mediaSession");
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(_metadata: MediaMetadataInit) {}
      },
    );
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { metadata: null, setActionHandler: actionHandler },
    });
    try {
      const view = render(<Harness currentTrack={song} />);
      view.rerender(<Harness currentTrack={undefined} />);
      expect(actionHandler).toHaveBeenCalledWith("play", null);
      expect(actionHandler).toHaveBeenCalledWith("nexttrack", null);
    } finally {
      if (original) Object.defineProperty(navigator, "mediaSession", original);
      else Reflect.deleteProperty(navigator, "mediaSession");
    }
  });

  it("uses the earlier of half duration and four minutes for submission", () => {
    expect(getScrobbleThreshold(180)).toBe(90);
    expect(getScrobbleThreshold(900)).toBe(240);
    expect(getScrobbleThreshold(0)).toBe(0);
  });

  it("publishes playback state only when its displayed second changes", async () => {
    const timedSong = { ...song, duration: 181 };
    const snapshots: Array<{ progress: number; duration: number }> = [];
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={timedSong}
        onController={(controller) => {
          player = controller;
          snapshots.push({ progress: controller.progress, duration: controller.duration });
        }}
      />,
    );
    await waitFor(() => expect(player.duration).toBe(181));
    const audio = view.getByTestId("audio") as HTMLAudioElement;
    let mediaDuration = 181.2;
    Object.defineProperty(audio, "duration", {
      configurable: true,
      get: () => mediaDuration,
    });
    snapshots.length = 0;

    audio.currentTime = 0.2;
    act(() => player.handleTimeUpdate());
    audio.currentTime = 0.8;
    act(() => player.handleTimeUpdate());
    expect(snapshots).toEqual([]);
    expect(player.progress).toBe(0);
    expect(player.duration).toBe(181);

    audio.currentTime = 1.1;
    act(() => player.handleTimeUpdate());
    audio.currentTime = 1.8;
    act(() => player.handleTimeUpdate());
    expect(snapshots).toEqual([{ progress: 1.1, duration: 181 }]);

    mediaDuration = 182.1;
    audio.currentTime = 1.9;
    act(() => player.handleTimeUpdate());
    mediaDuration = 182.9;
    audio.currentTime = 1.95;
    act(() => player.handleTimeUpdate());
    expect(snapshots).toEqual([
      { progress: 1.1, duration: 181 },
      { progress: 1.1, duration: 182.1 },
    ]);

    audio.currentTime = 2.01;
    act(() => player.handleTimeUpdate());
    expect(snapshots.at(-1)).toEqual({ progress: 2.01, duration: 182.1 });

    act(() => player.seek(2.8));
    expect(player.progress).toBe(2.8);

    audio.currentTime = 182.1;
    act(() => player.handleEnded());
    expect(player.progress).toBe(182.1);
    expect(player.duration).toBe(182.9);
  });

  it("uses exact media time for scrobbling between throttled progress updates", async () => {
    const timedSong = { ...song, duration: 181 };
    const timedClient = navidromeClient();
    let player!: AudioPlayerController;
    const view = render(
      <Harness
        currentTrack={timedSong}
        activeClient={timedClient}
        onController={(controller) => {
          player = controller;
        }}
      />,
    );
    await waitFor(() => expect(player.duration).toBe(181));
    const audio = view.getByTestId("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { configurable: true, value: 181 });

    audio.currentTime = 90.1;
    act(() => player.handleTimeUpdate());
    expect(player.progress).toBe(90.1);
    expect(timedClient.scrobble).not.toHaveBeenCalled();

    audio.currentTime = 90.6;
    act(() => player.handleTimeUpdate());
    expect(player.progress).toBe(90.1);
    expect(timedClient.scrobble).toHaveBeenCalledOnce();
    expect(timedClient.scrobble).toHaveBeenCalledWith(timedSong.id, true);
  });
});

function installAudioContext(
  options: {
    constructorError?: Error;
    resumePromise?: Promise<void>;
    resumePromises?: Promise<void>[];
  } = {},
) {
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as MediaElementAudioSourceNode;
  const analyser = {
    fftSize: 2_048,
    frequencyBinCount: 128,
    smoothingTimeConstant: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn((values: Uint8Array<ArrayBuffer>) => values.fill(96)),
    getByteTimeDomainData: vi.fn((values: Uint8Array<ArrayBuffer>) => values.fill(128)),
  } as unknown as AnalyserNode;
  const audioParam = (value = 0) => ({
    value,
    setTargetAtTime: vi.fn(),
  }) as unknown as AudioParam;
  const gains: GainNode[] = [];
  const filters: BiquadFilterNode[] = [];
  const splitter = { connect: vi.fn(), disconnect: vi.fn() } as unknown as ChannelSplitterNode;
  const merger = { connect: vi.fn(), disconnect: vi.fn() } as unknown as ChannelMergerNode;

  class MockAudioContext {
    state: AudioContextState = "suspended";
    currentTime = 0;
    sampleRate = 48_000;
    destination = {} as AudioDestinationNode;
    resume = vi.fn(async () => {
      await (options.resumePromises?.[instances.indexOf(this)] ?? options.resumePromise);
      this.state = "running";
    });
    close = vi.fn(async () => {
      this.state = "closed";
    });
    createMediaElementSource = vi.fn((_audio: HTMLMediaElement) => source);
    createAnalyser = vi.fn(() => analyser);
    createGain = vi.fn(() => {
      const gain = {
        gain: audioParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
        channelCount: 2,
        channelCountMode: "max",
        channelInterpretation: "speakers",
      } as unknown as GainNode;
      gains.push(gain);
      return gain;
    });
    createBiquadFilter = vi.fn(() => {
      const filter = {
        type: "lowpass",
        frequency: audioParam(350),
        Q: audioParam(1),
        gain: audioParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as BiquadFilterNode;
      filters.push(filter);
      return filter;
    });
    createChannelSplitter = vi.fn(() => splitter);
    createChannelMerger = vi.fn(() => merger);

    constructor() {
      if (options.constructorError) throw options.constructorError;
      instances.push(this);
    }
  }

  const instances: MockAudioContext[] = [];
  vi.stubGlobal("AudioContext", MockAudioContext);
  return { instances, source, analyser, gains, filters, splitter, merger };
}

function navidromeClient(
  overrides: Partial<SubsonicClient> = {},
): SubsonicClient {
  return {
    ping: vi.fn(async () => ({ status: "ok" as const, version: "1.16.1", openSubsonic: true })),
    getAlbumList2: vi.fn(async () => []),
    getAlbum: vi.fn(async (id) => ({ id, name: "Album", song: [] })),
    getArtists: vi.fn(async () => ({ index: [] })),
    getArtist: vi.fn(async (id) => ({ id, name: "Artist", album: [] })),
    getGenres: vi.fn(async () => []),
    getSongsByGenre: vi.fn(async () => []),
    search3: vi.fn(async () => ({ song: [], album: [], artist: [] })),
    getStarred2: vi.fn(async () => ({ song: [], album: [], artist: [] })),
    star: vi.fn(async () => undefined),
    unstar: vi.fn(async () => undefined),
    scrobble: vi.fn(async () => undefined),
    fetchCoverArt: vi.fn(async () => new Blob([], { type: "image/png" })),
    coverArtUrl: vi.fn((id) => `http://music.test/cover/${id}`),
    streamUrl: vi.fn((id) => `http://music.test/stream/${id}`),
    ...overrides,
  };
}

describe("useNavidrome", () => {
  it("keeps successful home sections when one request fails", async () => {
    const nextClient = navidromeClient({
      getAlbumList2: vi.fn(async (type) => {
        if (type === "newest") throw new Error("newest unavailable");
        return [{ id: type, name: type }];
      }),
      getGenres: vi.fn(async () => [{ value: "Rock", albumCount: 1, songCount: 4 }]),
    });
    const { result } = renderHook(() =>
      useNavidrome({ clientFactory: () => nextClient }),
    );

    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "password", username: "ada", password: "secret" },
      });
    });

    expect(result.current.serverInfo?.status).toBe("ok");
    expect(result.current.home.random).toHaveLength(1);
    expect(result.current.home.frequent).toHaveLength(1);
    expect(result.current.home.genres).toHaveLength(1);
    expect(result.current.home.warnings.newest).toMatch(/unavailable/i);
  });

  it("ignores a stale search response", async () => {
    let resolveFirst!: (value: { song: Track[]; album: []; artist: [] }) => void;
    let resolveSecond!: (value: { song: Track[]; album: []; artist: [] }) => void;
    const first = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveSecond = resolve;
    });
    const nextClient = navidromeClient({
      search3: vi.fn((query) => (query === "first" ? first : second)),
    });
    const { result } = renderHook(() =>
      useNavidrome({ clientFactory: () => nextClient }),
    );
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });

    act(() => {
      void result.current.search("first");
      void result.current.search("second");
    });
    await act(async () => {
      resolveSecond({ song: [{ ...song, id: "second" }], album: [], artist: [] });
      await second;
    });
    await waitFor(() => expect(result.current.searchResult?.song[0]?.id).toBe("second"));
    await act(async () => {
      resolveFirst({ song: [{ ...song, id: "first" }], album: [], artist: [] });
      await first;
    });

    expect(result.current.searchResult?.song[0]?.id).toBe("second");
  });

  it("invalidates an in-flight search when the query is cleared", async () => {
    let resolveSearch!: (value: { song: Track[]; album: []; artist: [] }) => void;
    const pending = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveSearch = resolve;
    });
    const nextClient = navidromeClient({ search3: vi.fn(() => pending) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });

    act(() => {
      void result.current.search("old");
      void result.current.search("");
    });
    await act(async () => {
      resolveSearch({ song: [{ ...song, id: "old" }], album: [], artist: [] });
      await pending;
    });

    expect(result.current.searchResult).toBeUndefined();
  });

  it("leaves connecting state when disconnect interrupts a pending ping", async () => {
    let resolvePing!: (value: { status: "ok"; version: string }) => void;
    const ping = new Promise<{ status: "ok"; version: string }>((resolve) => {
      resolvePing = resolve;
    });
    const nextClient = navidromeClient({ ping: vi.fn(() => ping) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    let connection!: Promise<void>;
    act(() => {
      connection = result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });
    await waitFor(() => expect(result.current.isConnecting).toBe(true));

    act(() => result.current.disconnect());
    await act(async () => {
      resolvePing({ status: "ok", version: "1.16.1" });
      await connection;
    });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isConnected).toBe(false);
  });

  it("rolls back only the failed favorite when mutations overlap", async () => {
    const secondTrack = { ...song, id: "song-2", title: "Signal Two" };
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const nextClient = navidromeClient({
      star: vi.fn((id) => (id === song.id ? first : second)),
      getStarred2: vi
        .fn()
        .mockResolvedValueOnce({ song: [], album: [], artist: [] })
        .mockResolvedValue({ song: [{ ...secondTrack, starred: "now" }], album: [], artist: [] }),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });

    let firstMutation!: Promise<void>;
    act(() => {
      firstMutation = result.current.toggleStar(song);
    });
    await waitFor(() => expect(result.current.starredSongs.map(({ id }) => id)).toContain(song.id));
    let secondMutation!: Promise<void>;
    act(() => {
      secondMutation = result.current.toggleStar(secondTrack);
    });
    await waitFor(() => expect(result.current.starredSongs).toHaveLength(2));

    await act(async () => {
      resolveSecond();
      await secondMutation;
      rejectFirst(new Error("first failed"));
      await firstMutation;
    });

    expect(result.current.starredSongs.map(({ id }) => id)).toEqual([secondTrack.id]);
  });

  it("restores the exact starred timestamp when unstar fails", async () => {
    const originalStarred = "2024-02-03T04:05:06.000Z";
    const starredTrack = { ...song, starred: originalStarred };
    const nextClient = navidromeClient({
      search3: vi.fn(async () => ({ song: [starredTrack], album: [], artist: [] })),
      getStarred2: vi.fn(async () => ({ song: [starredTrack], album: [], artist: [] })),
      unstar: vi.fn(async () => {
        throw new Error("write failed");
      }),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });
    await act(async () => {
      await result.current.search("signal");
    });

    await act(async () => {
      await result.current.toggleStar(result.current.searchResult!.song[0]!);
    });

    expect(result.current.searchResult?.song[0]?.starred).toBe(originalStarred);
    expect(result.current.starredSongs[0]?.starred).toBe(originalStarred);
  });

  it("does not let an older favorite refresh erase a newer pending mutation", async () => {
    const secondTrack = { ...song, id: "song-2", title: "Signal Two" };
    let resolveOldRefresh!: (value: { song: Track[]; album: []; artist: [] }) => void;
    const oldRefresh = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveOldRefresh = resolve;
    });
    let resolveSecondWrite!: () => void;
    const secondWrite = new Promise<void>((resolve) => {
      resolveSecondWrite = resolve;
    });
    const getStarred2 = vi
      .fn()
      .mockResolvedValueOnce({ song: [], album: [], artist: [] })
      .mockImplementationOnce(() => oldRefresh)
      .mockResolvedValue({
        song: [markAsStarred(song), markAsStarred(secondTrack)],
        album: [],
        artist: [],
      });
    const nextClient = navidromeClient({
      star: vi.fn((id) => (id === song.id ? Promise.resolve() : secondWrite)),
      getStarred2,
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });
    await act(async () => {
      await result.current.toggleStar(song);
    });
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(2));
    let pendingSecond!: Promise<void>;
    act(() => {
      pendingSecond = result.current.toggleStar(secondTrack);
    });
    await waitFor(() => expect(result.current.starredSongs).toHaveLength(2));

    try {
      await act(async () => {
        resolveOldRefresh({ song: [markAsStarred(song)], album: [], artist: [] });
        await oldRefresh;
      });
      expect(result.current.starredSongs.map(({ id }) => id)).toContain(secondTrack.id);
    } finally {
      await act(async () => {
        resolveSecondWrite();
        await pendingSecond;
      });
    }
  });
});

function markAsStarred(track: Track): Track {
  return { ...track, starred: "2024-01-01T00:00:00.000Z" };
}
