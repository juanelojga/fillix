---
title: Content Script DOM Isolation
impact: CRITICAL
category: security
tags: chrome-extension, xss, dom, content-script
---

# Content Script DOM Isolation

Content scripts run inside untrusted web pages. Every string that originates from the DOM (labels, placeholders, field values) must be treated as attacker-controlled. Never pass page-sourced data to APIs that interpret it as markup or code.

## Why This Matters

A malicious page can craft DOM attributes or text that, if inserted via `innerHTML` or `eval`, execute arbitrary JavaScript in the extension's content script context. Because the content script has access to `chrome.runtime.sendMessage`, an XSS here could escalate to full extension compromise.

## ❌ Incorrect

**Problem:** Using `innerHTML` with data read from the page.

```typescript
// ❌ Page controls field.label — attacker can inject <img onerror=...>
container.innerHTML = field.label;

// ❌ eval-based dynamic selector — attacker controls el.id
const sel = `label[for="${el.id}"]`;
document.querySelector(eval(sel));

// ❌ new Function with page data
const fn = new Function('data', pageScriptText);
fn(profile);
```

**Why it's dangerous:**

- `innerHTML` parses the string as HTML, executing inline handlers
- `eval` and `new Function` execute arbitrary code
- Content scripts have extension-level privileges (access to `chrome.runtime`)

## ✅ Correct

**Solution:** Use `textContent` for text and property assignment for values. Escape CSS identifiers with `CSS.escape()` before use in selectors.

```typescript
// ✅ textContent never parses markup
container.textContent = field.label;

// ✅ CSS.escape() neutralises characters with special meaning in selectors
// (already used correctly in src/lib/forms.ts:53)
const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);

// ✅ setFieldValue assigns .value directly — no HTML parsing
function setFieldValue(el: FillableElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

## Banned APIs in Content Scripts

| API                           | Risk               | Safe Alternative                |
| ----------------------------- | ------------------ | ------------------------------- |
| `el.innerHTML = x`            | Parses x as HTML   | `el.textContent = x`            |
| `el.outerHTML = x`            | Parses x as HTML   | DOM construction APIs           |
| `eval(x)`                     | Executes x as code | Static logic only               |
| `new Function(x)`             | Executes x as code | Static logic only               |
| `document.write(x)`           | Injects raw HTML   | `createElement` + `appendChild` |
| `el.insertAdjacentHTML(_, x)` | Parses x as HTML   | `insertAdjacentText`            |

## Best Practices

- [ ] All DOM reads treated as untrusted input before use in selectors
- [ ] `CSS.escape()` used whenever `el.id` or `el.name` is interpolated into a CSS selector
- [ ] Button/UI labels set with `textContent`, never `innerHTML`
- [ ] No `eval`, `new Function`, or `setTimeout(string)` in content script
- [ ] Profile data sent to Ollama via `JSON.stringify` (safe), not string interpolation

## References

- [Chrome Extension Content Script Security](https://developer.chrome.com/docs/extensions/mv3/content_scripts/#security)
- [OWASP DOM-based XSS](https://owasp.org/www-community/attacks/DOM_Based_XSS)
- [CSS.escape MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS/escape_static)
