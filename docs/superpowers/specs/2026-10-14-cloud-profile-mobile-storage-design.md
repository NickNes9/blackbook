# Black Book 0.9.8: Cloud Profile and Mobile Access

**Status:** Draft for user review. Design only; no implementation is approved yet.

## Goal

Let a person use the same Black Book profile on their computer and phone without creating a Black Book account or relying on a Black Book-hosted database. The profile stays in a normal folder or file location the person controls, such as a folder synchronized by a cloud-storage service.

The first 0.9.8 work is profile portability and safe cross-device saving. Mobile layout work follows after the storage foundation.

## User experience

### Computer

- Add **Connect to Mobile** to the profile/account menu.
- Open a short, nontechnical guide explaining that the profile must be placed in an online folder the person already uses, such as iCloud Drive, Google Drive, Dropbox, or another supported file provider.
- Let the person choose the profile location through the normal file/folder picker. Do not require a Black Book login or ask them to configure a server.
- Explain clearly that Black Book does not host or sync the file itself; their storage provider keeps the folder available on their devices.

### Phone

- Install the Black Book app.
- Choose **Open Profile**. The phone’s normal file picker lets the person browse supported local or cloud locations and select the same profile file.
- Remember the selected profile on that phone so the person does not need to find it again each time.
- If the provider is not installed or signed in, the operating system or provider handles that setup. Black Book does not collect provider credentials.

The system picker is the integration boundary: support providers exposed by the phone’s file system, rather than promising compatibility with every storage service. On iOS, the document picker supports iCloud and compatible third-party file providers; Android’s Storage Access Framework can open and modify files through supported document providers. The guide lives inside Black Book behind **Connect to Mobile**; users should not have to find a separate technical instruction file.

## Portable profile format

The selected file must be self-contained: profile data, format/version information, and any encryption metadata required to unlock it travel together. Today, named profile data is stored in a JSON file while password salt and key-derivation settings live in a separate local `profiles/auth` file. That split cannot support the promised “select this one file on the phone” flow as-is.

Introduce a versioned portable profile document/container and a safe migration path. Migration must preserve the original, create the portable copy, validate that it can be reopened, and only then offer to use the new location. Password-protected profiles retain their protection and use the same profile password on each device; provider sign-in remains separate and is never stored by Black Book.

## Save and conflict behavior

- When a profile opens, remember the file revision/content fingerprint that was loaded.
- Before saving, compare the current file with that loaded revision.
- If another device changed the file and that newer revision is visible, never silently replace it. Preserve the current device’s edits as a recoverable conflict copy and offer plain choices: **Open the newer version** or **Keep my changes as a separate copy**.
- Do not automatically merge transactions or linked records in the first version.
- Do not promise a reliable “open on another device” lock. Offline devices, app crashes, and delayed provider sync make such a lock unreliable without a Black Book sync service.
- If a shared profile is offline or its sync state cannot be verified, clearly show that changes are not yet synced and keep them recoverable on that device. Check for newer revisions before sending them back to the shared file.
- No file-only design can detect a change that the storage provider has not synchronized yet. Use platform file coordination where available, retain recoverable local copies, and document provider-specific limitations rather than promise perfect simultaneous editing across every service.

## Privacy and boundaries

- No Black Book account, hosted profile database, or Black Book sync server.
- Cloud-provider login and file access stay with the provider and operating system.
- The profile remains a user-owned, exportable portable file; if encrypted, it remains encrypted.
- No live collaborative editing or automatic conflict merging in 0.9.8.

## Acceptance criteria

1. A person can keep a profile in a supported cloud-synced location and open that same profile on a computer and phone.
2. The setup guide uses ordinary language and does not ask for a Black Book account or server configuration.
3. A password-protected profile can be opened on another device using the profile password, with all necessary non-secret encryption metadata contained in the portable profile.
4. If a newer revision is visible before save, the app does not overwrite it silently and preserves the current device’s edits as a recoverable copy.
5. If the cloud provider is unavailable or sync state is unknown, the app clearly distinguishes local changes from synced changes and keeps local work recoverable until a revision check can run.

## Open implementation details

- Choose the portable file extension/container while retaining a migration path from existing JSON profiles.
- Implement platform-native document access on iOS and Android so the selected provider file can be edited in place and access can be remembered safely.
- Decide how desktop portable builds choose and remember a profile folder/file.
- Define conflict-copy naming and recovery UI, including offline and provider-sync-in-progress cases.
- Validate behavior with supported providers and both mobile operating systems before claiming broad compatibility.

## Platform references

- [Apple document picker: open and edit documents in place](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller)
- [Android Storage Access Framework: open and modify cloud-provider files](https://developer.android.com/training/data-storage/shared/documents-files)
