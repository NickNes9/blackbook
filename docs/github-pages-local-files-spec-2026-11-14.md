# Spec: GitHub Pages web app with local profile files

## Objective

Let people open the current Black Book interface from a public GitHub Pages URL and use it without installing the desktop app. Profile contents must stay in the profile file on the user's device. Black Book must not upload transaction or profile data, or save a persistent profile copy in browser storage.

## Chosen approach

- Publish the existing browser interface as a static site from the `public` directory.
- Keep the local Node server for the installed desktop app. The hosted site does not run or depend on it.
- Use a user-selected JSON profile file as the source of truth.
- Keep the loaded profile in memory while the page is open. In browsers with the File System Access API, save changes back to the selected file after the browser grants write access. In other browsers, keep edits in memory until the user saves a replacement file through the download/share flow.
- Persist no profile JSON in localStorage, IndexedDB, Cache Storage, or a service worker. Remember only non-financial preferences and a file permission handle/name where the browser supports it; the handle contains no profile contents. Re-request access when the browser revokes permission.
- Do not add a Black Book API, login, analytics, cloud sync, or server-side profile store.

## User flow

1. Open the GitHub Pages URL and choose **OPEN FILE** or **CREATE PROFILE**.
2. Select an existing Black Book JSON profile, or create a new profile and choose where its file should be saved.
3. Use the app normally. The save indicator reflects direct file saving when supported, or unsaved in-memory edits when it is not.
4. On browsers without direct file writing, choose **SAVE FILE** and replace the local profile with the downloaded/shared copy.
5. On a later visit, open the profile file again. No profile contents are restored from browser storage.

## Hosting and paths

- Deploy static assets from `public` using GitHub Pages and GitHub Actions.
- Support the project URL path `/blackbook/`; local desktop serving at `/` must continue to work.
- Use a manual deployment trigger for the first release so routine development pushes do not publish unfinished changes.
- Package only the static app assets. Exclude `profiles/`, local databases, logs, executables, and release artwork.

## Browser behavior

- Chromium desktop: use a local file picker and write access to save directly to the chosen profile file after edits.
- Firefox and iPhone Safari: use the regular file picker, keep the profile in memory for the session, and provide a manual download/share save flow.
- Handle cancellation, permission loss, invalid JSON, and failed saves without replacing the active profile or claiming it was saved.
- If the user opens the same file in another tab or device, simultaneous edits are not merged. Treat one open editor per profile as the supported workflow.

## Feature boundaries

- Profile open, create, edit, import/export, and save must work without `/api` routes.
- Hide or replace desktop-only update installation and local invoice-path controls. Existing invoice records, payment history, and attachments embedded in the selected profile remain available; adding new invoice attachment behavior is out of scope.
- Use the rates already saved in the selected profile and allow manual rate edits. The hosted site makes no third-party requests for rates, updates, or other user-specific data.
- Password-protected profiles must prompt before opening. Keep the current scrypt and AES-GCM settings. New encrypted files include their non-secret salt and KDF settings in the profile file so the browser can unlock one selected file; the desktop app continues to read existing `auth` sidecars. For legacy encrypted files, allow selecting the adjacent `auth` file as well. Use a bundled, locally served, MIT-licensed browser scrypt implementation and Web Crypto AES-GCM; do not send passwords or profile data to a service.
- Invoice records, payment history, and already embedded attachment data remain usable. Opening a desktop-only path-linked invoice or attaching a new file is unavailable on the hosted site in this version.

## Privacy and failure behavior

- All profile reads, edits, and writes happen in the browser against the file the user selected.
- No transaction, account, category, debt, invoice, password, or profile document is sent to GitHub Pages or another service.
- The hosted app loads only its own static assets from GitHub Pages; it sends no profile-related requests to any service.
- Display a clear warning before leaving with unsaved manual-save changes.
- Never report success until the local write or download/share action completes.

## Success criteria

- The hosted app loads from `/blackbook/` and its assets work from both GitHub Pages and the desktop server root.
- A user can create, reopen, edit, and save a local profile with no Black Book server running.
- Unsupported file-writing browsers keep changes in memory and produce a replacement JSON file only after the user chooses Save.
- A profile document is not written to browser persistent storage or transmitted in a network request.
- The desktop app's existing server-backed profile flow continues to work.

## Verification approach

- Review the hosted output path, browser file read/write branches, and the static app's network requests.
- Do not add or run automated tests unless requested. Report any browser behavior that has not been confirmed on an actual device.

## Known limitation

- Invoice files linked by a local desktop path cannot be opened by a hosted page. Users can open those linked files in the desktop app.
