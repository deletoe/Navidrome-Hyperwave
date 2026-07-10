import { describe, expect, it, vi } from "vitest";

import {
  createInitialQueueState,
  getCurrentTrack,
  queueReducer,
  type QueueState,
} from "./playerQueue";

const track = (id: string) => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  duration: 180,
});

const queued = (
  ids: string[],
  currentIndex = 0,
  overrides: Partial<QueueState> = {},
): QueueState => ({
  tracks: ids.map(track),
  currentIndex,
  repeatMode: "off",
  shuffle: false,
  ...overrides,
});

describe("player queue reducer", () => {
  it("creates an empty stopped queue", () => {
    expect(createInitialQueueState()).toEqual({
      tracks: [],
      currentIndex: -1,
      repeatMode: "off",
      shuffle: false,
    });
    expect(getCurrentTrack(createInitialQueueState())).toBeUndefined();
  });

  it("replaces the queue and selects the requested starting track", () => {
    const state = queueReducer(queued(["old"]), {
      type: "playNow",
      tracks: [track("one"), track("two"), track("three")],
      startIndex: 1,
    });

    expect(state.tracks.map(({ id }) => id)).toEqual(["one", "two", "three"]);
    expect(getCurrentTrack(state)?.id).toBe("two");
  });

  it("assigns unique monotonically increasing identities to queue occurrences", () => {
    const duplicate = track("same");
    const first = queueReducer(createInitialQueueState(), {
      type: "playNow",
      tracks: [duplicate, duplicate],
    });
    const firstKeys = (first as QueueState & { occurrenceKeys: number[] }).occurrenceKeys;

    expect(firstKeys).toHaveLength(2);
    expect(firstKeys[1]).toBeGreaterThan(firstKeys[0]!);

    const replaced = queueReducer(first, { type: "playNow", tracks: [duplicate] });
    const replacementKey = (replaced as QueueState & { occurrenceKeys: number[] })
      .occurrenceKeys[0]!;
    expect(replacementKey).toBeGreaterThan(firstKeys[1]!);

    const cleared = queueReducer(replaced, { type: "clear" });
    const appended = queueReducer(cleared, { type: "append", tracks: [duplicate] });
    const appendedKey = (appended as QueueState & { occurrenceKeys: number[] })
      .occurrenceKeys[0]!;
    expect(appendedKey).toBeGreaterThan(replacementKey);
  });

  it("clamps an out-of-range play-now index", () => {
    const state = queueReducer(createInitialQueueState(), {
      type: "playNow",
      tracks: [track("one"), track("two")],
      startIndex: 99,
    });

    expect(getCurrentTrack(state)?.id).toBe("two");
  });

  it("appends tracks without changing the current track", () => {
    const state = queueReducer(queued(["one", "two"], 1), {
      type: "append",
      tracks: [track("three"), track("four")],
    });

    expect(state.tracks.map(({ id }) => id)).toEqual(["one", "two", "three", "four"]);
    expect(getCurrentTrack(state)?.id).toBe("two");
  });

  it("starts at the first appended track when the queue was empty", () => {
    const state = queueReducer(createInitialQueueState(), {
      type: "append",
      tracks: [track("one"), track("two")],
    });

    expect(getCurrentTrack(state)?.id).toBe("one");
  });

  it("inserts play-next tracks immediately after the current track", () => {
    const state = queueReducer(queued(["one", "four"], 0), {
      type: "playNext",
      tracks: [track("two"), track("three")],
    });

    expect(state.tracks.map(({ id }) => id)).toEqual(["one", "two", "three", "four"]);
    expect(getCurrentTrack(state)?.id).toBe("one");
  });

  it("starts at the first play-next track when the queue was empty", () => {
    const state = queueReducer(createInitialQueueState(), {
      type: "playNext",
      tracks: [track("one"), track("two")],
    });

    expect(getCurrentTrack(state)?.id).toBe("one");
  });

  it("selects a valid queue index and ignores an invalid one", () => {
    const initial = queued(["one", "two", "three"]);
    const selected = queueReducer(initial, { type: "select", index: 2 });

    expect(getCurrentTrack(selected)?.id).toBe("three");
    expect(queueReducer(selected, { type: "select", index: -1 })).toBe(selected);
    expect(queueReducer(selected, { type: "select", index: 3 })).toBe(selected);
  });

  it("moves forward and backward within queue boundaries", () => {
    const initial = queued(["one", "two", "three"], 1);

    expect(getCurrentTrack(queueReducer(initial, { type: "next" }))?.id).toBe("three");
    expect(getCurrentTrack(queueReducer(initial, { type: "previous" }))?.id).toBe("one");
  });

  it("stays at either boundary when repeat is off", () => {
    const atStart = queued(["one", "two"], 0);
    const atEnd = queued(["one", "two"], 1);

    expect(queueReducer(atStart, { type: "previous" })).toBe(atStart);
    expect(queueReducer(atEnd, { type: "next" })).toBe(atEnd);
  });

  it("wraps both boundaries when repeat is all", () => {
    const atStart = queued(["one", "two"], 0, { repeatMode: "all" });
    const atEnd = queued(["one", "two"], 1, { repeatMode: "all" });

    expect(getCurrentTrack(queueReducer(atStart, { type: "previous" }))?.id).toBe("two");
    expect(getCurrentTrack(queueReducer(atEnd, { type: "next" }))?.id).toBe("one");
  });

  it("keeps the current item when repeat is one", () => {
    const state = queued(["one", "two", "three"], 1, { repeatMode: "one" });

    expect(queueReducer(state, { type: "next" })).toBe(state);
    expect(queueReducer(state, { type: "previous" })).toBe(state);
  });

  it("removing an item before the current item preserves the current track", () => {
    const state = queueReducer(queued(["one", "two", "three"], 2), {
      type: "remove",
      index: 0,
    });

    expect(state.tracks.map(({ id }) => id)).toEqual(["two", "three"]);
    expect(getCurrentTrack(state)?.id).toBe("three");
    expect(state.currentIndex).toBe(1);
  });

  it("removing the current item selects its successor", () => {
    const state = queueReducer(queued(["one", "two", "three"], 1), {
      type: "remove",
      index: 1,
    });

    expect(state.tracks.map(({ id }) => id)).toEqual(["one", "three"]);
    expect(getCurrentTrack(state)?.id).toBe("three");
  });

  it("removing the current tail selects the preceding item", () => {
    const state = queueReducer(queued(["one", "two"], 1), {
      type: "remove",
      index: 1,
    });

    expect(getCurrentTrack(state)?.id).toBe("one");
  });

  it("removing the final current item produces an empty stopped queue", () => {
    const state = queued(["one"]);

    expect(queueReducer(state, { type: "remove", index: 0 })).toEqual(
      createInitialQueueState(),
    );
  });

  it("ignores an invalid removal index", () => {
    const state = queued(["one", "two"]);

    expect(queueReducer(state, { type: "remove", index: 2 })).toBe(state);
  });

  it("clears playback modes along with the queue", () => {
    const state = queued(["one", "two"], 1, { repeatMode: "all", shuffle: true });

    expect(queueReducer(state, { type: "clear" })).toEqual(createInitialQueueState());
  });

  it("shuffles deterministically without changing the current track", () => {
    const state = queued(["one", "two", "three", "four", "five"], 2);
    const first = queueReducer(state, { type: "shuffle", seed: 42 });
    const second = queueReducer(state, { type: "shuffle", seed: 42 });

    expect(first).toEqual(second);
    expect(first.shuffle).toBe(true);
    expect(getCurrentTrack(first)?.id).toBe("three");
    expect(first.tracks.map(({ id }) => id).sort()).toEqual([
      "five",
      "four",
      "one",
      "three",
      "two",
    ]);
  });

  it("keeps the reducer deterministic when shuffle has no explicit seed", () => {
    const state = queued(["one", "two", "three", "four"], 1);
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2);

    expect(queueReducer(state, { type: "shuffle" })).toEqual(
      queueReducer(state, { type: "shuffle" }),
    );
    expect(now).not.toHaveBeenCalled();
  });

  it("turns shuffle off without changing the shuffled order", () => {
    const shuffled = queued(["three", "one", "two"], 0, { shuffle: true });
    const state = queueReducer(shuffled, { type: "shuffle" });

    expect(state.shuffle).toBe(false);
    expect(state.tracks).toEqual(shuffled.tracks);
    expect(getCurrentTrack(state)?.id).toBe("three");
  });

  it("sets each repeat mode", () => {
    const initial = queued(["one"]);

    expect(queueReducer(initial, { type: "setRepeat", mode: "all" }).repeatMode).toBe("all");
    expect(queueReducer(initial, { type: "setRepeat", mode: "one" }).repeatMode).toBe("one");
    expect(queueReducer(initial, { type: "setRepeat", mode: "off" }).repeatMode).toBe("off");
  });
});
