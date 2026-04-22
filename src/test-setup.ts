import '@testing-library/jest-dom/vitest';

// Extend the chrome global from vitest.setup.ts with port/tab APIs
// needed by component tests — do not replace the whole object.
if (typeof chrome !== 'undefined') {
  const mockConnect = () => ({
    postMessage: () => {},
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onDisconnect: { addListener: () => {} },
    disconnect: () => {},
  });

  if (!chrome.runtime.connect) {
    // @ts-expect-error — polyfill
    chrome.runtime.connect = mockConnect;
  }

  if (!chrome.tabs.query) {
    chrome.tabs.query = () => Promise.resolve([]);
  }
}

// jsdom stub for DOM methods not implemented in the test environment
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
