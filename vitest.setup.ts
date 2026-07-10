import "@testing-library/jest-dom/vitest";

const noop = () => undefined;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }),
});

Object.defineProperties(HTMLMediaElement.prototype, {
  load: {
    configurable: true,
    value: noop,
  },
  pause: {
    configurable: true,
    value: noop,
  },
  play: {
    configurable: true,
    value: () => Promise.resolve(),
  },
});
