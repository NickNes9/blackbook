# Using Black Book from the website

The website version is a static copy of Black Book. It does not have a profile server or online account. Your profile is a JSON file on your device or in a folder that your storage provider syncs.

## Open a profile

Choose **OPEN FILE** and select a Black Book profile. On a device where the browser can safely keep a file permission, Black Book can remember the file handle and save directly to it. The browser remembers only the file permission handle and file name; Black Book keeps the profile contents in memory while the page is open.

Firefox and iPhone Safari do not provide the same direct overwrite workflow. Open the profile from the device's file picker, make changes, then choose **SAVE FILE**. Save the replacement and put it back in place of the original. On iPhone, choose **Save to Files** in the share sheet.

If a password protects the profile, enter it after opening the file. New encrypted profiles include their unlock settings inside the encrypted profile file, so the file can be opened on desktop and in the website version. Older encrypted files that use a separate `auth` file need that file selected once when opening.

## Create a profile

Choose **NEW PROFILE**, enter the profile and first account details, then create it. Add a password if you want the profile encrypted. In browsers with a save picker, choose the location for the new file. In other browsers, use **SAVE FILE** to download or share it.

## Use a synced folder

You can keep the profile file inside a folder synced by iCloud Drive, Dropbox, Google Drive, or another provider. Black Book itself does not connect to those services or upload the file. The provider syncs the file like any other document.

To use the same profile on another device, wait until the provider has finished syncing, then open that same file in Black Book. Do not edit one profile on two devices at the same time. If both devices save while offline or simultaneously, the storage provider may create conflicting copies; the website does not merge those changes.

## Save status

The desktop app reopens the last-used profile by its saved file path. Profiles default to the `profiles` folder beside the app and can also live in other directories. The app remembers the last path in `last-profile` beside the app.

**Autosave** in Settings defaults to **ON**. On desktop, each edit is first saved to `.profile-recovery` beside the app (with encryption preserved for password-protected profiles). After five seconds without edits, or when leaving the app, Black Book writes the recovered changes to the main profile file. This reduces repeated writes into synced folders. With autosave off, edits remain in local recovery until you click **SAVE** in the header; reopening the profile restores the recovered changes. Recovery files and the remembered path are excluded from Git.

The hosted website cannot use that desktop recovery folder. With direct file access and autosave enabled it writes the selected file; otherwise edits stay in memory until **SAVE FILE**. No profile contents are persisted in browser storage.

In browsers that can overwrite the selected file, **SAVED** means Black Book wrote to that file. In Firefox and iPhone Safari, **SAVE FILE** means you have edits to export. After you save or share the replacement, Black Book cannot confirm that you replaced the original file.

The profile contents are not stored in localStorage, IndexedDB, Cache Storage, or a service worker, and are not sent to the website host or another service. A supported browser may retain a file permission handle and its display name so it can offer to reopen the same file.

## Differences in the website version

The desktop app keeps its local profile manager and update installer. The website version opens one profile file at a time, has no automatic update check, and cannot open an invoice attachment that is only a path on another computer. Attachments already embedded in a profile continue to work. Exchange rates are taken from the profile and can be edited manually; the website does not fetch rates from an external service.
