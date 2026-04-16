---
title: Meaningful Names in TypeScript Chrome Extensions
impact: MEDIUM
category: maintainability
tags: naming, readability, typescript, chrome-extension
---

# Meaningful Names in TypeScript Chrome Extensions

Choose descriptive, intention-revealing names. In a Chrome extension, good naming is especially important because the same concepts (fields, messages, contexts) appear across isolated execution contexts that can't share runtime state — the names are the only shared documentation.

## Why This Matters

Code is read far more than it is written. In an extension with three isolated contexts (content script, background worker, popup), a reader encountering a message handler or a DOM utility has no REPL to probe — they must understand the code from its names alone.

## ❌ Incorrect

```typescript
// ❌ Cryptic — what is 'el', 'v', 'ctx'?
function fill(el: any, v: string, ctx: object): void {
  (el as HTMLInputElement).value = v;
}

// ❌ Abbreviations obscure intent
const cfg = await getOllamaCfg();
const flds = detectFlds();
const resp = await sendMsg(msg);

// ❌ Generic 'data' / 'result' gives no information about shape
const data = await res.json();
const result = JSON.parse(data.response);

// ❌ Boolean variable without is/has/can prefix is ambiguous
let loaded = false;
let ok = checkResponse(r);
```

## ✅ Correct

```typescript
// ✅ Types and names document intent without comments
function setFieldValue(element: FillableElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ✅ Full words, no abbreviations
const ollamaConfig = await getOllamaConfig();
const detectedFields = detectFields();
const inferResponse = (await chrome.runtime.sendMessage(msg)) as MessageResponse;

// ✅ Names describe the shape, not just 'data'
const tagsResponse = (await res.json()) as { models: { name: string }[] };
const modelNames = tagsResponse.models.map((m) => m.name);

// ✅ Boolean prefix makes truthiness obvious
let isModelListLoaded = false;
const isResponseOk = response.ok && 'value' in response;
```

## Message Type Literals

Message type literals use SCREAMING_SNAKE_CASE to visually distinguish them from variable names and to signal they are protocol-level constants:

```typescript
// ✅ SCREAMING_SNAKE_CASE for message type literals (src/types.ts:19–21)
export type Message =
  | { type: 'OLLAMA_INFER'; field: FieldContext; profile: UserProfile }
  | { type: 'OLLAMA_LIST_MODELS' };

// ❌ camelCase is easily confused with variable names
export type Message =
  | { type: 'ollamaInfer'; field: FieldContext; profile: UserProfile }
  | { type: 'ollamaListModels' };
```

## Chrome Extension Naming Conventions

| Concept                             | Convention             | Example                           |
| ----------------------------------- | ---------------------- | --------------------------------- |
| Message type literals               | `SCREAMING_SNAKE_CASE` | `'OLLAMA_INFER'`                  |
| Exported interfaces                 | `PascalCase`           | `FieldContext`, `UserProfile`     |
| Event handler functions             | verb + noun            | `fillAll`, `injectTriggerButton`  |
| DOM element variables               | noun + element type    | `triggerButton`, `modelSelect`    |
| Chrome storage keys                 | `camelCase`            | `profile`, `ollama`               |
| Async functions returning responses | noun + `Response`      | `inferResponse`, `modelsResponse` |

## Best Practices

- [ ] No single-letter variables outside of trivial `for (let i ...)` loops
- [ ] No abbreviations in exported types or function signatures (`cfg` → `config`, `el` → `element`)
- [ ] Boolean names start with `is`, `has`, or `can`
- [ ] Message type literals are SCREAMING_SNAKE_CASE strings
- [ ] Variables holding API responses named after what they contain, not just `data` or `result`
- [ ] DOM element variables end with the element type (`btn`, `select`, `input`) or full word

## References

- [TypeScript Naming Conventions](https://google.github.io/styleguide/tsguide.html#naming-style)
- [Clean Code by Robert Martin — Chapter 2: Meaningful Names](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
