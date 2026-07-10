import type { Track } from "../types";

export type RepeatMode = "off" | "all" | "one";

export interface QueueState {
  tracks: Track[];
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  occurrenceKeys?: number[];
  nextOccurrenceKey?: number;
}

export type QueueAction =
  | { type: "playNow"; tracks: Track[]; startIndex?: number }
  | { type: "append"; tracks: Track[] }
  | { type: "playNext"; tracks: Track[] }
  | { type: "select"; index: number }
  | { type: "next" }
  | { type: "previous" }
  | { type: "remove"; index: number }
  | { type: "clear" }
  | { type: "shuffle"; seed?: number }
  | { type: "setRepeat"; mode: RepeatMode };

export function createInitialQueueState(): QueueState {
  return { tracks: [], currentIndex: -1, repeatMode: "off", shuffle: false };
}

export function getCurrentTrack(state: QueueState): Track | undefined {
  return state.currentIndex >= 0 ? state.tracks[state.currentIndex] : undefined;
}

export function getCurrentOccurrenceKey(state: QueueState): number | undefined {
  return state.currentIndex >= 0 ? state.occurrenceKeys?.[state.currentIndex] : undefined;
}

function nextOccurrenceKey(state: QueueState): number {
  return Math.max(state.nextOccurrenceKey ?? 0, ...(state.occurrenceKeys ?? [0]));
}

function normalizeOccurrenceKeys(state: QueueState): {
  occurrenceKeys: number[];
  nextOccurrenceKey: number;
} {
  const currentNext = nextOccurrenceKey(state);
  if (state.occurrenceKeys?.length === state.tracks.length) {
    return { occurrenceKeys: state.occurrenceKeys, nextOccurrenceKey: currentNext };
  }
  return {
    occurrenceKeys: state.tracks.map((_, index) => currentNext + index + 1),
    nextOccurrenceKey: currentNext + state.tracks.length,
  };
}

function allocateOccurrenceKeys(
  state: QueueState,
  count: number,
): { occurrenceKeys: number[]; nextOccurrenceKey: number } {
  const currentNext = nextOccurrenceKey(state);
  return {
    occurrenceKeys: Array.from({ length: count }, (_, index) => currentNext + index + 1),
    nextOccurrenceKey: currentNext + count,
  };
}

function clearQueueState(state: QueueState): QueueState {
  const currentNext = nextOccurrenceKey(state);
  return currentNext > 0
    ? {
        ...createInitialQueueState(),
        occurrenceKeys: [],
        nextOccurrenceKey: currentNext,
      }
    : createInitialQueueState();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function queueSeed(state: QueueState): number {
  let hash = 2_166_136_261;
  const source = `${state.currentIndex}|${state.tracks.map(({ id }) => id).join("|")}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function shuffleTracks(state: QueueState, seed: number): QueueState {
  if (state.tracks.length < 2) return { ...state, shuffle: true };
  const random = seededRandom(seed);
  const normalized = normalizeOccurrenceKeys(state);
  const entries = state.tracks.map((track, index) => ({
    track,
    occurrenceKey: normalized.occurrenceKeys[index]!,
  }));
  const current = entries[state.currentIndex];
  const rest = entries.filter((_, index) => index !== state.currentIndex);
  for (let index = rest.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [rest[index], rest[target]] = [rest[target]!, rest[index]!];
  }
  const shuffled = [...rest];
  const currentIndex = clamp(state.currentIndex, 0, shuffled.length);
  if (current) shuffled.splice(currentIndex, 0, current);
  return {
    ...state,
    tracks: shuffled.map(({ track }) => track),
    occurrenceKeys: shuffled.map(({ occurrenceKey }) => occurrenceKey),
    nextOccurrenceKey: normalized.nextOccurrenceKey,
    currentIndex,
    shuffle: true,
  };
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "playNow": {
      if (!action.tracks.length) return clearQueueState(state);
      const occurrences = allocateOccurrenceKeys(state, action.tracks.length);
      return {
        tracks: [...action.tracks],
        currentIndex: clamp(action.startIndex ?? 0, 0, action.tracks.length - 1),
        repeatMode: state.repeatMode,
        shuffle: false,
        ...occurrences,
      };
    }
    case "append": {
      if (!action.tracks.length) return state;
      const normalized = normalizeOccurrenceKeys(state);
      const occurrences = allocateOccurrenceKeys(
        { ...state, nextOccurrenceKey: normalized.nextOccurrenceKey },
        action.tracks.length,
      );
      return {
        ...state,
        tracks: [...state.tracks, ...action.tracks],
        occurrenceKeys: [...normalized.occurrenceKeys, ...occurrences.occurrenceKeys],
        nextOccurrenceKey: occurrences.nextOccurrenceKey,
        currentIndex: state.currentIndex < 0 ? 0 : state.currentIndex,
      };
    }
    case "playNext": {
      if (!action.tracks.length) return state;
      const normalized = normalizeOccurrenceKeys(state);
      const occurrences = allocateOccurrenceKeys(
        { ...state, nextOccurrenceKey: normalized.nextOccurrenceKey },
        action.tracks.length,
      );
      if (state.currentIndex < 0) {
        return {
          ...state,
          tracks: [...action.tracks],
          occurrenceKeys: occurrences.occurrenceKeys,
          nextOccurrenceKey: occurrences.nextOccurrenceKey,
          currentIndex: 0,
        };
      }
      const insertion = state.currentIndex + 1;
      return {
        ...state,
        tracks: [
          ...state.tracks.slice(0, insertion),
          ...action.tracks,
          ...state.tracks.slice(insertion),
        ],
        occurrenceKeys: [
          ...normalized.occurrenceKeys.slice(0, insertion),
          ...occurrences.occurrenceKeys,
          ...normalized.occurrenceKeys.slice(insertion),
        ],
        nextOccurrenceKey: occurrences.nextOccurrenceKey,
      };
    }
    case "select":
      return action.index >= 0 && action.index < state.tracks.length
        ? { ...state, currentIndex: action.index }
        : state;
    case "next": {
      if (state.currentIndex < 0 || state.repeatMode === "one") return state;
      if (state.currentIndex < state.tracks.length - 1) {
        return { ...state, currentIndex: state.currentIndex + 1 };
      }
      return state.repeatMode === "all" ? { ...state, currentIndex: 0 } : state;
    }
    case "previous": {
      if (state.currentIndex < 0 || state.repeatMode === "one") return state;
      if (state.currentIndex > 0) return { ...state, currentIndex: state.currentIndex - 1 };
      return state.repeatMode === "all"
        ? { ...state, currentIndex: state.tracks.length - 1 }
        : state;
    }
    case "remove": {
      if (action.index < 0 || action.index >= state.tracks.length) return state;
      if (state.tracks.length === 1) return clearQueueState(state);
      const normalized = normalizeOccurrenceKeys(state);
      const tracks = state.tracks.filter((_, index) => index !== action.index);
      const occurrenceKeys = normalized.occurrenceKeys.filter(
        (_, index) => index !== action.index,
      );
      let currentIndex = state.currentIndex;
      if (action.index < state.currentIndex) currentIndex -= 1;
      else if (action.index === state.currentIndex) currentIndex = Math.min(currentIndex, tracks.length - 1);
      return {
        ...state,
        tracks,
        occurrenceKeys,
        nextOccurrenceKey: normalized.nextOccurrenceKey,
        currentIndex,
      };
    }
    case "clear":
      return clearQueueState(state);
    case "shuffle":
      return state.shuffle
        ? { ...state, shuffle: false }
        : shuffleTracks(state, action.seed ?? queueSeed(state));
    case "setRepeat":
      return { ...state, repeatMode: action.mode };
    default:
      return state;
  }
}
