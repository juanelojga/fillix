// Minimal Chrome extension API stub — lets background.ts import without throwing.
// Individual test files may override specific properties with vi.stubGlobal.
if (typeof chrome === 'undefined') {
  const noop = () => {};
  const listener = { addListener: noop, removeListener: noop };
  // @ts-expect-error — polyfill
  global.chrome = {
    runtime: {
      id: 'test-extension-id',
      onMessage: listener,
      onConnect: listener,
      onInstalled: listener,
      onStartup: listener,
      sendMessage: async () => ({}),
      getManifest: () => ({ content_scripts: [] }),
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    sidePanel: { setPanelBehavior: noop },
    tabs: { sendMessage: async () => ({}), get: async () => ({ url: '' }) },
    scripting: { executeScript: async () => {} },
  };
}

// Polyfill CSS.escape for jsdom environments where it's missing
if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
  const cssObj = typeof CSS !== 'undefined' ? (CSS as Record<string, unknown>) : {};
  cssObj['escape'] = function (value: string): string {
    const str = String(value);
    const length = str.length;
    let result = '';
    const firstCodeUnit = str.charCodeAt(0);
    for (let index = 0; index < length; index++) {
      const codeUnit = str.charCodeAt(index);
      if (
        (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
        codeUnit === 0x007f ||
        (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
      ) {
        result += '\\' + codeUnit.toString(16) + ' ';
        continue;
      }
      if (index === 0 && length === 1 && codeUnit === 0x002d) {
        result += '\\' + str.charAt(index);
        continue;
      }
      if (
        codeUnit >= 0x0080 ||
        codeUnit === 0x002d ||
        codeUnit === 0x005f ||
        (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
        (codeUnit >= 0x0061 && codeUnit <= 0x007a)
      ) {
        result += str.charAt(index);
        continue;
      }
      result += '\\' + str.charAt(index);
    }
    return result;
  };
  // @ts-expect-error — polyfill
  global.CSS = cssObj;
}
