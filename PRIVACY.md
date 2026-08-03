# Privacy Policy

**Effective date:** August 3, 2026

Sidenote for X is a local-only browser extension.

## Data it stores

The extension stores X handles, note text, and the note's last-updated timestamp in `chrome.storage.local` inside the current browser profile. Storage access is restricted to trusted extension contexts, and mutations are serialized by the extension's background worker.

## Data it does not collect

Sidenote does not collect, transmit, sell, share, or analyze personal data. It has no backend, analytics, telemetry, advertising, remote code, or third-party data processor.

## Website access

The extension runs on `x.com` and `twitter.com` only so it can add a private-note card to profiles and display existing notes beside posts. Saved note surfaces render inside closed Shadow DOM, preventing ordinary host-page JavaScript from querying them. Note entry happens in a separate extension-origin window so X cannot observe its input events. The extension does not modify, submit, or intercept posts, messages, passwords, cookies, or authentication tokens.

The browser and software with device-level or equivalent extension privileges remain part of the user's trust boundary.

## Backups and deletion

Export happens only when the user explicitly chooses **Export**. The resulting JSON file is created locally. Import reads only the file the user selects.

Users can delete individual notes, choose **Clear all**, remove the extension, or clear extension data in the browser. Browser removal behavior is controlled by the browser vendor.

## Changes

Material changes to this policy will be published in this repository and reflected by the effective date above.
