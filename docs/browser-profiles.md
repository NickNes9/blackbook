# Profiles in the website

Black Book supports two browser storage workflows. Neither sends profile contents to a Black Book server.

## Folder mode

On browsers with a supported read/write directory picker, choose OPEN FOLDER. Black Book writes profile.json and its .blackbook change journals in that directory. The browser remembers a permission handle; it can ask you to reconnect it later. A plain filesystem path cannot grant a website access to a folder.

## File mode: Firefox and iPhone Safari

1. Choose OPEN FILE and select a Black Book profile.json or a JSON export. On iPhone, select it through Files, including iCloud Drive or another available file provider.
2. Edit normally. Changes remain in the current tab's memory. The browser remembers the workflow and filename, not the profile contents.
3. Click SAVE FILE at the top, or in Settings under Profiles.
4. On Firefox, save the downloaded JSON and replace the original profile file. On iPhone, choose Save to Files in the share sheet and replace the original file.
5. Wait for your storage provider to finish syncing before opening the profile on another device.

NEW PROFILE FILE creates a profile in memory. Use SAVE FILE to put it on your device. The profile edit dialog can change its name, currency and defaults. File profiles use plain JSON; password-encrypted desktop profiles must first be exported as JSON.

SAVE FILE means changes have not been exported. EXPORTED means the file was handed to the browser's download or share interface; it does not verify that the original file was replaced. Closing or refreshing with unexported changes triggers the browser's leave warning when supported. Mobile browsers may terminate tabs without that warning, so export regularly.

Open the file again after restarting or refreshing the website. File mode cannot remember read/write access to the original location, overwrite it silently, or monitor its cloud updates. Use one device at a time. Do not edit a folder-mode profile concurrently with an exported file-mode copy: the copy does not contain the folder's merge journals.

## Implementation

The shared editor and save queue operate on the loaded data. File mode bypasses the server save endpoint and websocket connection. browser-file-profile.js implements the file picker, new-profile form, JSON export, iPhone share integration, save indicator and leave warning. Folder mode retains its existing directory store.

Logic checks cover JSON export, no server save requests in file mode, download and simulated iPhone sharing/cancellation, save status, and unexported-change warnings. Real Firefox desktop and Safari iPhone interface acceptance still requires a device/browser pass.
