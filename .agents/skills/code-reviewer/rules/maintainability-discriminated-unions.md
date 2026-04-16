---
title: Exhaustive Discriminated Unions for Messages
impact: MEDIUM
category: maintainability
tags: typescript, discriminated-unions, exhaustiveness, message-passing
---

# Exhaustive Discriminated Unions for Messages

All cross-context message types must use discriminated unions with a literal `type` field, and every `switch` on that type must include an exhaustiveness check. This makes adding a new message kind a compile-time-guided process — the compiler tells you every place that needs updating.

## Why This Matters

The extension has three isolated contexts (content script, background worker, popup) that communicate via `chrome.runtime.sendMessage`. Without exhaustiveness checks, adding a new message kind silently falls through `switch` statements and may go unhandled at runtime, with no error at build time.

## ❌ Incorrect

**Problem:** `if`/`else if` chains and switches without exhaustiveness — new message kinds silently fall through.

```typescript
// ❌ if-chain: a new message kind is silently ignored
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OLLAMA_INFER') {
    handleInfer(msg).then(sendResponse);
    return true;
  } else if (msg.type === 'OLLAMA_LIST_MODELS') {
    handleList().then(sendResponse);
    return true;
  }
  // New message kind added to types.ts → nothing fails, handler just drops it
});

// ❌ switch without default exhaustiveness check
async function handle(msg: Message): Promise<MessageResponse> {
  switch (msg.type) {
    case 'OLLAMA_INFER':
      return { ok: true, value: await inferFieldValue(config, msg.field, msg.profile) };
    case 'OLLAMA_LIST_MODELS':
      return { ok: true, models: await listModels(config) };
    // Adding OLLAMA_NEW_KIND to the Message union → TypeScript doesn't warn
  }
}
```

## ✅ Correct

**Solution:** TypeScript's `never` type used as an exhaustiveness guard (`src/background.ts:17` follows this pattern). When a new case is added to the `Message` union, the compiler flags it immediately.

```typescript
// ✅ Discriminated union in types.ts (already correct)
export type Message =
  | { type: 'OLLAMA_INFER'; field: FieldContext; profile: UserProfile }
  | { type: 'OLLAMA_LIST_MODELS' };

// ✅ Exhaustive switch — adding a new Message variant causes a compile error here
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
    default: {
      // If a new message type is added to the union and this default is reached,
      // TypeScript raises: "Type 'NewMessageType' is not assignable to type 'never'"
      const _exhaustive: never = msg;
      throw new Error(`Unhandled message type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

## Adding a New Message Kind — Correct Workflow

1. Add the new variant to `Message` and `MessageResponse` in `src/types.ts`
2. TypeScript's exhaustiveness check in `background.ts` immediately raises a compile error
3. Add the `case` in `background.ts`'s `handle` function
4. Add the `case` in any other switch that covers `Message`

This is the workflow described in `CLAUDE.md`: _"TypeScript's exhaustiveness check will flag the rest."_

## Best Practices

- [ ] All `Message` variants use SCREAMING_SNAKE_CASE string literals (e.g. `'OLLAMA_INFER'`)
- [ ] Every `switch (msg.type)` has a `default: { const _: never = msg; }` guard
- [ ] `MessageResponse` uses the same `ok: true | false` discriminant pattern already in `src/types.ts`
- [ ] New message kinds update both `Message` and `MessageResponse` unions before adding the `case`
- [ ] `satisfies MessageResponse` used at call sites (as in `background.ts:10`) to validate shape at compile time

## References

- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [TypeScript Exhaustiveness Checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking)
