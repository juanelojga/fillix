# The frozen world

Three files, all copied straight off the side panel — no DevTools, no `chrome.storage`.

| File                | Where it comes from                                                                 |
| ------------------- | ----------------------------------------------------------------------------------- |
| `profile.md`        | **Profile** tab → the big Markdown box. Click in it, `Ctrl+A`, `Ctrl+C`.            |
| `availability.json` | **Profile** tab → Meeting availability → the five day fields + the time-zone field. |
| `ollama.json`       | **Settings** tab (base URL, chat model) + **Profile** tab (embed model).            |

`profile.md` is the CV verbatim, `##` headings and all — those headings are what `drew_on` cites,
so nothing about them may be reworded. Scrubbing is **name and contact only**; employers,
projects and section titles stay exactly as written.

Nothing here is committed until it has been through the scrubber.

## Why the console snippet failed

`chrome.storage` is undefined in a normal page's DevTools — a web page gets a stub `chrome`
object with no `storage` on it, which is why the error was "reading 'local' of undefined" rather
than "chrome is not defined". Extension storage is only reachable from an extension context.

If the raw JSON is ever wanted, the reliable route is a normal tab pointed at the extension's own
page — copy the id from `chrome://extensions` (Developer mode on) and open
`chrome-extension://<id>/sidepanel/index.html`, then F12 there. But for this, the UI is faster
and there is nothing in storage the panel does not already show.
