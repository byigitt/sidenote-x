<div align="center">
  <img src="assets/icon-128.png" width="88" alt="Sidenote for X logo">
  <h1>Sidenote for X</h1>
  <p><strong>Your private context layer for X.</strong></p>
  <p>Leave notes on profiles. See your own context beside their posts. Nothing is published or sent to a server.</p>
</div>

## Why

The feed remembers engagement. You remember context.

- “This account constantly posts ragebait.”
- “Reliable on technical topics.”
- “Shares the same thread every day.”
- “Half of these posts look AI-generated.”

Sidenote gives those thoughts a private, persistent place. Over time, your own notes become a lightweight filter layered on top of the algorithm.

## Features

- **Profile notes** — add or edit a private note from an extension-owned editor opened by the profile card.
- **Feed context** — saved notes appear as restrained annotations on that person's posts.
- **Isolated local storage** — notes use extension-only `chrome.storage.local`; all writes are serialized by a background worker.
- **Isolated note surfaces** — saved profile/feed annotations use closed Shadow DOM; note entry happens in an extension-origin window, outside X's page and keyboard event path.
- **Note manager** — search, add, edit, and delete notes from the extension popup.
- **Portable backups** — export and import a versioned JSON backup.
- **X and Twitter domains** — works on both `x.com` and `twitter.com`.
- **Manifest V3** — compatible with Chromium-based browsers.

## Install from source

### Chrome, Brave, Arc, Vivaldi, Opera

1. Clone or download this repository.
2. Open `chrome://extensions` (your browser may use its own scheme).
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository directory — the folder containing `manifest.json`.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository directory.

## Usage

1. Open any profile on X.
2. Find the **SIDENOTE** card below the profile name.
3. Choose **ADD PRIVATE NOTE** or **EDIT NOTE** to open the extension-owned editor.
4. Write what future-you should remember and choose **SAVE LOCALLY**.
5. When that account appears in your feed, your note appears beneath the post.
6. Open the toolbar icon to manage or back up all notes.

Saving an empty note removes it. Notes are capped at 280 characters.

## Privacy

Sidenote requests only:

- `storage` — to keep notes locally in your browser profile.
- Access to `x.com` and `twitter.com` — to place the profile card and feed annotations in the page.

It contains no trackers, remote scripts, network client, telemetry, or server component. Read the full [privacy policy](PRIVACY.md).

The extension also restricts storage access to trusted extension contexts. X page scripts cannot call the storage layer, inspect closed note surfaces, or observe keystrokes entered in the separate extension-origin editor. As with any browser extension, the browser itself and other software with equivalent device-level privileges remain part of your trust boundary.

> Browser storage is local to the current browser profile and can be removed when the extension or browser data is cleared. Export a backup if the notes matter to you.

## Development

Requires Node.js 20+ and `zip`. The real-browser smoke test also needs Linux/Xvfb (or an equivalent display).

```bash
npm install
npm run check
npx playwright install chromium
npm run smoke
npm run package
```

Commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Run unit and DOM behavior tests |
| `npm run lint` | Run ESLint |
| `npm run check` | Run lint and all unit tests |
| `npm run smoke` | Load the unpacked extension in real Chromium and verify profile → storage → feed |
| `npm run package` | Create `dist/sidenote-x-<version>.zip` |

## Design principles

- Private by default, stated plainly.
- Keep note text and controls outside the host page's inspectable DOM.
- Useful context without competing with X's primary interface.
- Monochrome, sharp, and quiet — no engagement mechanics of its own.
- Safe DOM rendering: user-authored notes are assigned as text, never interpreted as HTML.

## License

[MIT](LICENSE)
