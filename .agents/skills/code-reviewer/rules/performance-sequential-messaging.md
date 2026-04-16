---
title: Avoid Sequential chrome.runtime.sendMessage in Loops
impact: HIGH
category: performance
tags: chrome-extension, messaging, performance, async, promise
---

# Avoid Sequential chrome.runtime.sendMessage in Loops

Awaiting `chrome.runtime.sendMessage` inside a `for` loop serialises all Ollama inference calls. With N fields the user waits through N full round-trips before any field is filled. Use `Promise.all` to dispatch all requests concurrently.

## Why This Matters

Each `sendMessage` call involves:

1. IPC from content script → background service worker
2. An HTTP POST to `localhost:11434/api/generate`
3. Ollama inference (LLM latency, typically 0.5–5 s per field)

Serialising these multiplies the wait time linearly:

```
5 fields × 2 s per field = 10 s total (sequential)
5 fields, all in parallel  = ~2 s total (concurrent)
```

## ❌ Incorrect

**Problem:** `await` inside `for…of` forces sequential execution (`src/content.ts:45–51`).

```typescript
// ❌ Sequential — each field waits for the previous one to finish
for (const field of fields) {
  const msg: Message = { type: 'OLLAMA_INFER', field: field.context, profile };
  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse;
  if (response.ok && 'value' in response && response.value) {
    setFieldValue(field.element, response.value);
  }
}
```

With 5 fields and 2 s inference each: **10 s** before the user sees anything.

## ✅ Correct

**Solution:** `Promise.all` dispatches all messages in parallel, then applies results.

```typescript
// ✅ Parallel — all fields inflight simultaneously
await Promise.all(
  fields.map(async (field) => {
    const msg: Message = { type: 'OLLAMA_INFER', field: field.context, profile };
    const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse;
    if (response.ok && 'value' in response && response.value) {
      setFieldValue(field.element, response.value);
    }
  }),
);
```

With 5 fields and 2 s inference each: **~2 s** (bounded by the slowest single field).

## Related: Missing Fetch Timeout

`src/lib/ollama.ts` makes `fetch` calls with no timeout. If Ollama is slow or unresponsive the UI hangs indefinitely. Add an `AbortController` with a reasonable timeout:

```typescript
// ✅ Timeout prevents indefinite hang
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30_000);

try {
  const res = await fetch(`${config.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt, stream: false, format: 'json' }),
    signal: controller.signal,
  });
  // ...
} finally {
  clearTimeout(timeoutId);
}
```

Or with `AbortSignal.timeout` (Chrome 124+):

```typescript
const res = await fetch(url, {
  signal: AbortSignal.timeout(30_000),
  // ...
});
```

## Best Practices

- [ ] No `await` inside `for` / `forEach` / `reduce` when iterations are independent
- [ ] `Promise.all` for concurrent independent async work
- [ ] `Promise.allSettled` when partial failure is acceptable (fills as many fields as possible)
- [ ] All `fetch` calls have a timeout via `AbortController` or `AbortSignal.timeout`
- [ ] Content script button disabled during fill to prevent double-submission (already done in `src/content.ts:39`)

## References

- [MDN: Promise.all](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
