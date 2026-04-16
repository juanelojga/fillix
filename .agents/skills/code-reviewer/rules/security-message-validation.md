---
title: Message Sender Validation
impact: CRITICAL
category: security
tags: chrome-extension, message-passing, trust-boundary, background-worker
---

# Message Sender Validation

`chrome.runtime.onMessage` receives messages from every content script running in every tab. A compromised or malicious web page can craft messages that attempt to trigger extension behaviour. Always validate the sender and enforce message shape before acting.

## Why This Matters

The background service worker is the only context that reaches the Ollama API. If it executes arbitrary messages without verifying their origin, an attacker whose page hosts a malicious iframe can probe or abuse that API. Even without network access, an unvalidated message could trigger unexpected state changes.

## ❌ Incorrect

**Problem:** Trusting the message shape without checking the sender.

```typescript
// ❌ No sender verification — any page can trigger OLLAMA_INFER
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OLLAMA_INFER') {
    inferFieldValue(config, msg.field, msg.profile).then(sendResponse);
    return true;
  }
});

// ❌ Using the sender's tab URL to gate access — easily spoofed
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.tab?.url?.startsWith('https://trusted.example.com')) {
    handle(msg).then(sendResponse);
    return true;
  }
});
```

**Why it's dangerous:**

- Any content script on any tab can send a message to the background worker
- Tab URLs are attacker-controlled (the page sets `document.location`)
- A compromised third-party script on any site can send inference requests

## ✅ Correct

**Solution:** Verify `sender.id` matches the extension's own ID so only scripts the extension itself injected can reach the background worker.

```typescript
// ✅ Only messages from this extension's own scripts are handled
chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return; // drop external messages

  handle(msg as Message)
    .then(sendResponse)
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error } satisfies MessageResponse);
    });
  return true;
});
```

For the message shape itself, TypeScript's discriminated union switch (as used in `src/background.ts:17`) ensures every case is handled and new message kinds cause a compile error:

```typescript
// ✅ TypeScript exhaustiveness enforces correct shape at compile time
async function handle(msg: Message): Promise<MessageResponse> {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const value = await inferFieldValue(config, msg.field, msg.profile);
      return { ok: true, value };
    }
    case 'OLLAMA_LIST_MODELS': {
      const models = await listModels(config);
      return { ok: true, models };
    }
    // Adding a new message kind without a case here → compile error
  }
}
```

## No Hardcoded Secrets

Never embed API keys, tokens, or credentials in extension source files or `manifest.config.ts`. The Ollama base URL is user-configurable via `chrome.storage.local` (`src/lib/storage.ts`); that pattern is correct and should be followed for any new external endpoint.

## Best Practices

- [ ] `sender.id === chrome.runtime.id` check in every `onMessage` listener
- [ ] Message shape validated via TypeScript discriminated unions (compile-time)
- [ ] No secrets in source files or manifest
- [ ] New message kinds added to `types.ts` `Message` union before use — the exhaustive switch in `background.ts` will catch missing cases at compile time

## References

- [Chrome Extension Message Passing Security](https://developer.chrome.com/docs/extensions/mv3/messaging/#security-considerations)
- [Cross-extension messaging risks](https://developer.chrome.com/docs/extensions/mv3/messaging/#external)
