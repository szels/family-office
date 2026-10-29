import '@testing-library/jest-dom/vitest'

// Vitest's jsdom environment aliases `window` to `globalThis` itself and
// never forwards `localStorage`/`sessionStorage` onto it (they're absent
// from its copied-keys list), so both names resolve to Node's own built-in
// `localStorage` (inert without `--localstorage-file`) instead of jsdom's
// working implementation. The real one is reachable via the jsdom instance
// vitest stashes at `globalThis.jsdom`; wire it up explicitly.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom
if (dom) {
  globalThis.localStorage = dom.window.localStorage
  globalThis.sessionStorage = dom.window.sessionStorage
}
