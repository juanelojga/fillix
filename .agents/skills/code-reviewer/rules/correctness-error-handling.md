---
title: Proper Error Handling in Chrome Extension Contexts
impact: HIGH
category: correctness
tags: chrome-extension, async, error-handling, json-parsing, fetch
---

# Proper Error Handling in Chrome Extension Contexts

Chrome extensions have two correctness traps that don't exist in ordinary web apps: async `onMessage` handlers that silently drop responses if `return true` is missing, and `JSON.parse` on external API output where a TypeScript `as` cast provides zero runtime protection.

## Why This Matters

- A missing `return true` in a message listener closes the response channel synchronously, causing the caller's `sendMessage` promise to resolve `undefined` silently — no error thrown, no stack trace.
- `JSON.parse(x) as T` compiles fine but does nothing at runtime. If Ollama returns malformed JSON or an unexpected shape, the code proceeds with `undefined` where a string was expected.

---

## ❌ Incorrect

### Missing `return true` in async listener

```typescript
// ❌ sendResponse is called after the listener returns — channel already closed
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg).then(sendResponse); // async, but no return true
  // Listener returns undefined → Chrome closes the channel → sendResponse is a no-op
});
```

### Type assertion instead of runtime shape validation

```typescript
// ❌ As-cast tells TypeScript the shape but performs no runtime check
const data = (await res.json()) as { response: string };
const parsed = JSON.parse(data.response) as { value?: string };
// If Ollama returns { error: "..." }, data.response is undefined → JSON.parse throws
// If it returns {"answer": "..."}, parsed.value is undefined — silently skipped
```

### Unguarded `fetch` with no timeout

```typescript
// ❌ Hangs indefinitely if Ollama is slow or unresponsive
const res = await fetch(`${config.baseUrl}/api/generate`, { method: 'POST', ... });
```

---

## ✅ Correct

### `return true` keeps the response channel open

```typescript
// ✅ return true tells Chrome to keep the channel open for the async response
// (already correct in src/background.ts:12)
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error } satisfies MessageResponse);
    });
  return true; // ← required
});
```

### Runtime shape validation after `JSON.parse`

```typescript
// ✅ Validate shape before trusting parsed output (src/lib/ollama.ts:27–30)
try {
  const parsed: unknown = JSON.parse(data.response);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'value' in parsed &&
    typeof (parsed as { value: unknown }).value === 'string'
  ) {
    return (parsed as { value: string }).value;
  }
  return ''; // unexpected shape → skip field, never hallucinate
} catch {
  return ''; // malformed JSON → skip field
}
```

### `fetch` with timeout

```typescript
// ✅ Abort after 30 s — prevents indefinite hang
const res = await fetch(`${config.baseUrl}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: config.model, prompt, stream: false, format: 'json' }),
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}`);
```

---

## Error Handling in Content Script

The content script should surface errors to the user rather than silently doing nothing:

```typescript
// ✅ Show error state on the button instead of silent failure
async function fillAll(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Fillix: thinking…';
  try {
    const profile = await getProfile();
    const fields = detectFields();
    await Promise.all(
      fields.map(async (field) => {
        const msg: Message = { type: 'OLLAMA_INFER', field: field.context, profile };
        const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse;
        if (response.ok && 'value' in response && response.value) {
          setFieldValue(field.element, response.value);
        }
      }),
    );
  } catch {
    btn.textContent = 'Fillix: error'; // user knows something went wrong
    setTimeout(() => {
      btn.textContent = original;
    }, 3000);
    return;
  } finally {
    btn.disabled = false;
  }
  btn.textContent = original;
}
```

## Best Practices

- [ ] Every async `onMessage` listener returns `true` synchronously
- [ ] `JSON.parse` output validated at runtime — `as` casts are compile-time only
- [ ] All `fetch` calls include a timeout via `AbortSignal.timeout`
- [ ] Errors propagated as `{ ok: false; error: string }` responses (existing `MessageResponse` pattern)
- [ ] Content script shows visible error state — never silently fails to the user

## References

- [Chrome Extension Message Passing — Asynchronous responses](https://developer.chrome.com/docs/extensions/mv3/messaging/#simple)
- [MDN: AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
