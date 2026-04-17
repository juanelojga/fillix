# Fillix Extension — Manual Testing Procedure

## Prerequisites

Before starting any test, ensure the following are in place:

1. **Ollama is running** — `ollama serve` is active on `http://localhost:11434`
2. **At least one model is pulled** — e.g. `ollama pull llama3.2`
3. **OLLAMA_ORIGINS is set** — Ollama must accept requests from the extension origin:
   ```
   OLLAMA_ORIGINS=chrome-extension://*
   ```
   On macOS: `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart Ollama.
4. **Extension is loaded** — Run `pnpm build`, then go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the `dist/` folder.

---

## 1. Installation Smoke Test

| Step | Action                        | Expected                                                                                         |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| 1.1  | Open `chrome://extensions`    | Extension "Fillix" appears in the list, enabled, no errors                                       |
| 1.2  | Check service worker          | Click "Service worker" link on the extension card — DevTools opens, no console errors on startup |
| 1.3  | Click the Fillix toolbar icon | The side panel opens (not a popup window)                                                        |

---

## 2. Popup — Configuration

> Access: Right-click the Fillix icon → "Options", or open `chrome-extension://<id>/src/popup/index.html` directly.

| Step | Action                                                                                                              | Expected                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 2.1  | Open the popup                                                                                                      | Fields are pre-populated with defaults: URL = `http://localhost:11434`, model dropdown populated from Ollama |
| 2.2  | Click "Refresh" next to the model dropdown                                                                          | Dropdown re-populates with all models available in Ollama                                                    |
| 2.3  | Fill in all profile fields (First name, Last name, Email, Phone, Address, City, State/Region, Postal code, Country) | Fields accept input without errors                                                                           |
| 2.4  | Click "Save"                                                                                                        | Status message "Saved" appears briefly                                                                       |
| 2.5  | Close and re-open the popup                                                                                         | All profile values and Ollama config are still populated (persistence check)                                 |

---

## 3. Side Panel — Chat Tab

> Access: Click the Fillix toolbar icon. The side panel opens on the right side of the browser.

### 3.1 Basic Chat

| Step  | Action                                                 | Expected                                                                                |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 3.1.1 | Open the side panel                                    | Chat tab is active. Input area and send button are visible. Message list is empty.      |
| 3.1.2 | Type a short message (e.g. "Hello") and press Enter    | User bubble appears immediately. Assistant bubble starts streaming tokens in real-time. |
| 3.1.3 | Wait for response to complete                          | Streaming stops. Response is rendered as formatted markdown (not raw text).             |
| 3.1.4 | Type a follow-up message (e.g. "What did I just say?") | Assistant responds with context from the first message (conversation continuity).       |

### 3.2 Streaming Controls

| Step  | Action                                                                                   | Expected                                                        |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 3.2.1 | Send a message that produces a long response (e.g. "Write a 500 word essay about space") | Streaming begins                                                |
| 3.2.2 | While streaming, click the "Stop" button                                                 | Stream halts immediately. Partial response is kept in the chat. |
| 3.2.3 | Send another message after stopping                                                      | Chat resumes normally (port reconnects).                        |

### 3.3 New Conversation

| Step  | Action                                                                                    | Expected                                                  |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 3.3.1 | After having several messages in history, click "New conversation"                        | All messages are cleared. Chat area is empty.             |
| 3.3.2 | Send a message referencing previous conversation (e.g. "What was the essay I asked for?") | Model has no memory of previous messages (fresh context). |

### 3.4 Multiline Input

| Step  | Action                                   | Expected                           |
| ----- | ---------------------------------------- | ---------------------------------- |
| 3.4.1 | In the input textarea, press Shift+Enter | A new line is inserted (not sent). |
| 3.4.2 | Press Enter alone                        | Message is sent.                   |

### 3.5 Markdown Rendering

| Step  | Action                                     | Expected                                                   |
| ----- | ------------------------------------------ | ---------------------------------------------------------- |
| 3.5.1 | Ask "Show me a markdown table with 3 rows" | Response renders as an HTML table, not raw `\|---\|` text. |
| 3.5.2 | Ask "Give me a Python code snippet"        | Response shows a syntax-highlighted code block.            |
| 3.5.3 | Ask for a bulleted list                    | Response renders `<ul><li>` HTML, not raw `- item` text.   |

---

## 4. Side Panel — Settings Tab

| Step | Action                                                                                                      | Expected                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 4.1  | Click the "Settings" tab                                                                                    | Settings panel appears with Ollama URL, model dropdown, and system prompt. |
| 4.2  | Click "Refresh" next to the model dropdown                                                                  | Dropdown updates with models from Ollama.                                  |
| 4.3  | Change the Ollama base URL to something non-localhost (e.g. `http://192.168.1.5:11434`)                     | Yellow warning "Not using localhost…" appears below the URL field.         |
| 4.4  | Change the URL back to `http://localhost:11434`                                                             | Warning disappears.                                                        |
| 4.5  | Change the system prompt (e.g. "You are a pirate. Respond only in pirate speak.") and click "Save Settings" | "Saved" confirmation appears.                                              |
| 4.6  | Switch to Chat tab, start a new conversation, and send a message                                            | Model responds in pirate speak (system prompt is applied).                 |
| 4.7  | Reload the side panel (close and reopen)                                                                    | System prompt is still the custom one (persistence check).                 |

---

## 5. Content Script — Form Auto-Fill

> Navigate to any page with HTML form inputs (e.g. a signup form, checkout page, or use a local HTML file with several `<input>` fields).

| Step | Action                                                           | Expected                                                                                                        |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 5.1  | Navigate to a page with text inputs                              | A fixed black "Fillix: fill" button appears at the bottom-right corner of the page.                             |
| 5.2  | Navigate to a page with no fillable inputs (e.g. a news article) | No button appears.                                                                                              |
| 5.3  | Click "Fillix: fill" on a form page                              | Fields are populated with values inferred from your user profile.                                               |
| 5.4  | Verify field types are respected                                 | Password, file, hidden, checkbox, and radio inputs are NOT filled.                                              |
| 5.5  | Check that a React/Vue form registers the fill                   | The form's internal state (e.g. submit button enabled) updates, meaning `input` and `change` events were fired. |
| 5.6  | Verify a `<select>` dropdown is filled                           | The dropdown selects the most appropriate option (e.g. country matches the profile country).                    |
| 5.7  | Check a field with `aria-label`                                  | The field is recognized and filled correctly (label resolution test).                                           |

---

## 6. Error & Edge Cases

### 6.1 Ollama Offline

| Step  | Action                                         | Expected                                                                        |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| 6.1.1 | Stop Ollama (`killall ollama` or stop the app) | —                                                                               |
| 6.1.2 | Open side panel and send a message             | An error message appears in the chat (orange/red background), not a blank hang. |
| 6.1.3 | Click "Fillix: fill" on a form page            | Fields remain empty; no JS error in the console.                                |
| 6.1.4 | Click "Refresh" models in popup or settings    | Error is shown or dropdown remains empty.                                       |

### 6.2 Port Disconnect Recovery

| Step  | Action                                                      | Expected                                                                  |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| 6.2.1 | Open the side panel and send a message successfully         | —                                                                         |
| 6.2.2 | Navigate to a new page (which may cycle the service worker) | —                                                                         |
| 6.2.3 | Send another message in the side panel                      | Port reconnects automatically; message sends without manual intervention. |

---

## 7. Persistence Across Sessions

| Step | Action                                                  | Expected                       |
| ---- | ------------------------------------------------------- | ------------------------------ |
| 7.1  | Configure profile, Ollama URL, model, and system prompt | —                              |
| 7.2  | Close Chrome completely and reopen                      | —                              |
| 7.3  | Open the popup and side panel Settings                  | All saved values are restored. |

---

## Validation Summary

| Area        | Critical Checks                                                         |
| ----------- | ----------------------------------------------------------------------- |
| Setup       | Ollama origin configured, extension loads without errors                |
| Popup       | Config persists, model list fetches, profile saves                      |
| Chat        | Streaming works, Stop aborts, New Conversation clears, markdown renders |
| Settings    | System prompt applies, non-localhost warning triggers                   |
| Auto-fill   | Button appears on forms, skips non-text fields, fires React events      |
| Errors      | Graceful messages when Ollama is offline                                |
| Persistence | All settings survive browser restart                                    |
