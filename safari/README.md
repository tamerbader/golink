# Go Links — Safari extension

A Safari Web Extension port of the [Go Links](../README.md) Chrome extension. It
brings corporate-style **go links** to Safari: type `go/calendar` and jump
straight to `https://outlook.cloud.microsoft/calendar` — no server, no DNS
tricks, all local.

Unlike the Chrome build (which uses `chrome.storage.sync`), the Safari build
stores every shortcut in **`storage.local`**, so your links stay **private to
this device** and are never uploaded or synced.

## Features

Identical to the Chrome extension:

- **`go/{command}` shortcuts** — `go/calendar`, `go/mail`, `go/drive`, etc.
- **Argument passthrough** — put `%s` in a destination URL and pass arguments:
  with `gh → https://github.com/search?q=%s`, typing `go/gh/my query` searches
  GitHub. Without `%s`, extra path is appended (`go/calendar/view/week`).
- **Quick add** — click the toolbar icon to save the current tab as a go link.
- **Manage shortcuts** — full add / edit / delete / search UI with JSON
  import & export.
- **Local, private storage** — shortcuts live in `storage.local`; they never
  leave your Mac.
- **Omnibox keyword** — the `go` keyword handler ships in the code and activates
  automatically on any browser that supports the omnibox API. See
  [Safari limitations](#safari-limitations) below.

## Requirements

- macOS 13 Ventura or later (Safari 16.4+), which is required for
  Manifest V3 background service workers in Safari Web Extensions.
- [Xcode](https://developer.apple.com/xcode/) (free from the Mac App Store).
  Xcode ships with the `safari-web-extension-converter` command-line tool used
  below.

## Set up (convert + run)

Safari extensions must be packaged inside a native macOS app. Apple provides a
converter that turns this Web Extension folder into an Xcode project.

1. **Convert this folder into an Xcode project.** From the repository root run:

   ```bash
   xcrun safari-web-extension-converter safari --project-location ./safari-build --app-name "Go Links"
   ```

   This reads `safari/manifest.json` and generates a Mac app project under
   `./safari-build` that wraps the extension. (Add `--macos-only` if you don't
   want an iOS target.)

2. **Open the generated project in Xcode** (the converter offers to open it, or
   double-click the `.xcodeproj` under `safari-build`).

3. **Build & run** the app target (press ▶). A small container app launches;
   it just hosts the extension.

4. **Enable the extension in Safari.**
   - Open **Safari → Settings → Extensions**.
   - If you don't see **Go Links**, first enable
     **Safari → Settings → Advanced → “Show features for web developers”**,
     then in the new **Developer** tab turn on
     **“Allow unsigned extensions”** (this resets each time Safari restarts).
   - Tick the checkbox next to **Go Links** to enable it, and choose
     **Always Allow** for website access if prompted (needed so the `go/`
     redirect can fire).

5. **Done.** Click the toolbar icon to save the current page, or open the
   extension's **Options** page to add your first shortcut. It starts empty —
   no shortcuts are created for you.

## Usage

| You type | Result |
| --- | --- |
| `go/calendar` | Opens the saved URL for `calendar` |
| `go/gh/copilot` | `gh` has `%s` → searches GitHub for `copilot` |
| `go/calendar/view/week` | Appends `/view/week` to the calendar URL |
| `go/unknown` | Opens the manager with `unknown` pre-filled to create it |
| `go` | Opens the shortcut manager |

The extension works by intercepting Safari's attempt to load the host **`go`**
and redirecting it. Because `go/calendar` contains a slash, Safari usually
treats it as a URL. If Safari searches instead, pick the URL option once and it
will autocomplete `go/...` as a URL from then on.

## Safari limitations

- **Omnibox keyword (`go` + Space):** Safari does not implement the
  `browser.omnibox` API, so the keyword-suggestion fallback that Chrome offers
  is unavailable in Safari. The code registers the handler only when the API
  exists (feature-detected), so the extension loads cleanly and the core
  `go/{command}` address-bar redirect works exactly as it does in Chrome. If a
  future Safari version adds omnibox support, the keyword will start working
  with no code changes.

## How it works

Same architecture as the Chrome extension, with two Safari-specific changes:

- `src/resolver.js` — pure, dependency-free resolution logic (parse + `%s`
  substitution + path append). Shared, unchanged, and unit-tested.
- `src/background.js` — MV3 background service worker. Listens to
  `webNavigation.onBeforeNavigate` for the `go` host and redirects via
  `tabs.update`. Uses `storage.local` (private) instead of `storage.sync`, and
  guards the omnibox registration behind feature detection.
- `options.html` / `src/options.js` — management UI (reads/writes
  `storage.local`).
- `popup.html` / `src/popup.js` — quick-add popup (reads/writes
  `storage.local`).
- Every script picks the promise-based `browser` namespace on Safari and falls
  back to `chrome` elsewhere: `const api = globalThis.browser ?? globalThis.chrome;`.

## Development

The resolver logic is shared and covered by the repository's tests
(`npm test`). `npm run check` also syntax-checks the Safari sources and
validates `safari/manifest.json`. After editing files, rebuild from Xcode (or
re-run the converter) and reload Safari.
