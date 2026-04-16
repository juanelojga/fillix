# Code Review Guidelines — Fillix Chrome Extension

**A quick-reference guide for AI agents reviewing Fillix TypeScript/Chrome extension code**, organized by priority and impact.

---

## Table of Contents

### Security — **CRITICAL**

1. [Content Script DOM Isolation](#content-script-dom-isolation)
2. [Message Sender Validation](#message-sender-validation)

### Performance — **HIGH**

3. [Avoid Sequential sendMessage in Loops](#avoid-sequential-sendmessage-in-loops)

### Correctness — **HIGH**

4. [Proper Error Handling in Chrome Extension Contexts](#proper-error-handling-in-chrome-extension-contexts)

### Maintainability — **MEDIUM**

5. [Meaningful Names in TypeScript Chrome Extensions](#meaningful-names-in-typescript-chrome-extensions)
6. [Exhaustive Discriminated Unions for Messages](#exhaustive-discriminated-unions-for-messages)

---

## Security

### Content Script DOM Isolation

**Impact: CRITICAL** | **Category: security** | **Tags:** chrome-extension, xss, dom, content-script

Content scripts run inside untrusted pages. Never pass page-sourced strings (labels, placeholders, field values) to `innerHTML`, `eval`, or `new Function`. Use `textContent` for text and property assignment for values. Escape CSS identifiers with `CSS.escape()`.

#### ❌ Incorrect

```typescript
// Page controls field.label — attacker can inject <img onerror=...>
container.innerHTML = field.label;

// Unescaped el.id used in CSS selector — selector injection
const label = document.querySelector(`label[for="${el.id}"]`);
```

#### ✅ Correct

```typescript
// textContent never parses markup
container.textContent = field.label;

// CSS.escape() neutralises special characters (src/lib/forms.ts:53)
const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
```

[➡️ Full details: security-content-script-isolation.md](rules/security-content-script-isolation.md)

---

### Message Sender Validation

**Impact: CRITICAL** | **Category: security** | **Tags:** chrome-extension, message-passing, trust-boundary

`chrome.runtime.onMessage` receives messages from all content scripts across all tabs. Verify `sender.id === chrome.runtime.id` before acting on any message to prevent untrusted pages from triggering extension behaviour.

#### ❌ Incorrect

```typescript
// Any page can trigger inference — no sender check
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse);
  return true;
});
```

#### ✅ Correct

```typescript
// Only messages from this extension's own scripts are handled
chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handle(msg as Message)
    .then(sendResponse)
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error } satisfies MessageResponse);
    });
  return true;
});
```

[➡️ Full details: security-message-validation.md](rules/security-message-validation.md)

---

## Performance

### Avoid Sequential sendMessage in Loops

**Impact: HIGH** | **Category: performance** | **Tags:** chrome-extension, messaging, async, promise

`await` inside a `for` loop serialises all Ollama inference calls. With N fields the user waits N × inference-latency before seeing any result. Use `Promise.all` to dispatch all requests concurrently.

#### ❌ Incorrect

```typescript
// Sequential — each field waits for the previous (src/content.ts:45–51)
for (const field of fields) {
  const msg: Message = { type: 'OLLAMA_INFER', field: field.context, profile };
  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse;
  if (response.ok && 'value' in response && response.value) {
    setFieldValue(field.element, response.value);
  }
}
```

#### ✅ Correct

```typescript
// Parallel — all fields in-flight simultaneously
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

Also flag: `fetch` calls in `src/lib/ollama.ts` have no timeout — add `signal: AbortSignal.timeout(30_000)`.

[➡️ Full details: performance-sequential-messaging.md](rules/performance-sequential-messaging.md)

---

## Correctness

### Proper Error Handling in Chrome Extension Contexts

**Impact: HIGH** | **Category: correctness** | **Tags:** chrome-extension, async, json-parsing, fetch

Two Chrome extension-specific traps: (1) async `onMessage` handlers that don't `return true` silently drop responses; (2) `JSON.parse(x) as T` is a compile-time-only assertion — it performs no runtime shape check.

#### ❌ Incorrect

```typescript
// Missing return true — response channel closes before sendResponse is called
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse); // no return true
});

// Type assertion provides zero runtime validation (src/lib/ollama.ts:28)
const parsed = JSON.parse(data.response) as { value?: string };
```

#### ✅ Correct

```typescript
// return true keeps channel open (already correct in src/background.ts:12)
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg).then(sendResponse).catch(/* ... */);
  return true; // ← required
});

// Validate shape at runtime before trusting the parsed value
const parsed: unknown = JSON.parse(data.response);
const value =
  typeof parsed === 'object' &&
  parsed !== null &&
  'value' in parsed &&
  typeof (parsed as { value: unknown }).value === 'string'
    ? (parsed as { value: string }).value
    : '';
```

[➡️ Full details: correctness-error-handling.md](rules/correctness-error-handling.md)

---

## Maintainability

### Meaningful Names in TypeScript Chrome Extensions

**Impact: MEDIUM** | **Category: maintainability** | **Tags:** naming, readability, typescript

Avoid abbreviations in exported types and function signatures. Name variables after what they contain, not just `data` or `result`. Booleans use `is`/`has`/`can` prefixes.

#### ❌ Incorrect

```typescript
const cfg = await getOllamaCfg();
const flds = detectFlds();
const data = await res.json();
let loaded = false;
```

#### ✅ Correct

```typescript
const ollamaConfig = await getOllamaConfig();
const detectedFields = detectFields();
const tagsResponse = (await res.json()) as { models: { name: string }[] };
let isModelListLoaded = false;
```

Message type literals use `SCREAMING_SNAKE_CASE` (e.g. `'OLLAMA_INFER'`) to visually distinguish protocol constants from variables.

[➡️ Full details: maintainability-naming.md](rules/maintainability-naming.md)

---

### Exhaustive Discriminated Unions for Messages

**Impact: MEDIUM** | **Category: maintainability** | **Tags:** typescript, discriminated-unions, exhaustiveness

Every `switch` on a `Message` type must include a `default: { const _: never = msg; }` guard so that adding a new message kind to `types.ts` causes an immediate compile error at the handler.

#### ❌ Incorrect

```typescript
// No default — new message kind silently falls through
switch (msg.type) {
  case 'OLLAMA_INFER':
    return { ok: true, value: await inferFieldValue(config, msg.field, msg.profile) };
  case 'OLLAMA_LIST_MODELS':
    return { ok: true, models: await listModels(config) };
}
```

#### ✅ Correct

```typescript
// Exhaustiveness guard — new variant in types.ts triggers compile error here
switch (msg.type) {
  case 'OLLAMA_INFER': {
    const value = await inferFieldValue(config, msg.field, msg.profile);
    return { ok: true, value };
  }
  case 'OLLAMA_LIST_MODELS': {
    const models = await listModels(config);
    return { ok: true, models };
  }
  default: {
    const _exhaustive: never = msg;
    throw new Error(`Unhandled message type: ${JSON.stringify(_exhaustive)}`);
  }
}
```

[➡️ Full details: maintainability-discriminated-unions.md](rules/maintainability-discriminated-unions.md)

---

## Review Checklist for Chrome Extension PRs

**Security (CRITICAL — review first)**

- [ ] No `innerHTML`, `eval`, or `new Function` with page-sourced data in content scripts
- [ ] `CSS.escape()` used for any dynamic CSS selector using DOM attributes
- [ ] `sender.id === chrome.runtime.id` checked in every `onMessage` listener
- [ ] No hardcoded secrets in source files or `manifest.config.ts`
- [ ] New `host_permissions` entries justified and minimal

**Performance (HIGH)**

- [ ] No `await sendMessage` inside a `for` loop — use `Promise.all`
- [ ] All `fetch` calls include `signal: AbortSignal.timeout(n)`
- [ ] Content script does no heavy work on load — only after user clicks the button

**Correctness (HIGH)**

- [ ] Every async `onMessage` listener `return true` synchronously
- [ ] `JSON.parse` on external output validated at runtime, not just cast with `as`
- [ ] New message kinds added to both `Message` and `MessageResponse` in `types.ts`
- [ ] Exhaustive `switch` covers all `Message` variants

**Maintainability (MEDIUM)**

- [ ] No abbreviations in exported types or function signatures
- [ ] Boolean names start with `is`, `has`, or `can`
- [ ] Message type literals are `SCREAMING_SNAKE_CASE`
- [ ] Every `switch (msg.type)` has a `default: never` exhaustiveness guard

**Manifest / Build**

- [ ] No new permissions beyond what the change requires
- [ ] New pages/scripts added to `manifest.config.ts` (crxjs handles wiring)
- [ ] `pnpm typecheck` passes with no errors

---

## Severity Levels

| Level        | Description                             | Examples                                                | Action                       |
| ------------ | --------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| **CRITICAL** | Security vulnerabilities, data exposure | `innerHTML` with DOM data, missing sender check         | Block merge, fix immediately |
| **HIGH**     | Performance issues, correctness bugs    | Sequential messaging, missing `return true`, no timeout | Fix before merge             |
| **MEDIUM**   | Maintainability, code quality           | Naming, missing exhaustiveness guard                    | Fix or accept with TODO      |
| **LOW**      | Style preferences, minor improvements   | Formatting, minor refactoring                           | Optional                     |

---

## Review Output Format

```markdown
## Security Issues (X found)

### CRITICAL: innerHTML with page-sourced data in `injectTriggerButton()`

**File:** `src/content.ts:17`
**Issue:** `container.innerHTML = field.label` — page controls this string
**Fix:** Use `container.textContent = field.label`

## Performance Issues (X found)

### HIGH: Sequential sendMessage in `fillAll()`

**File:** `src/content.ts:45–51`
**Issue:** `await` inside `for` loop — fields filled one at a time
**Fix:** Replace with `Promise.all(fields.map(async (field) => { ... }))`

## Summary

- 🔴 CRITICAL: 1
- 🟠 HIGH: 1
- 🟡 MEDIUM: 2
- ⚪ LOW: 0

**Recommendation:** Address CRITICAL and HIGH issues before merging.
```

---

## References

- Individual rule files in `rules/` directory
- [Chrome Extension MV3 Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [TypeScript Exhaustiveness Checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking)
