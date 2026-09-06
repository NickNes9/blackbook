# Design: Local Hardening and Reliability Upgrade

## Goal

Improve Black Book without changing how existing `profiles/*.json` data is
read or requiring users to migrate their financial history. The application
remains a single-machine, local-only finance console with the current screens
and desktop launcher.

## Compatibility Contract

- Existing profile JSON is read as-is. No profile is rewritten merely by
  starting the app.
- Unknown profile fields survive a save because the client continues to submit
  the complete document it loaded.
- All new server-side metadata is optional and kept outside profile JSON where
  possible.
- Automated tests use temporary directories and fixture profiles only. They
  never read, write, or enumerate the real `profiles/` directory.
- The existing executable launcher remains usable. Its server discovery ports
  stay synchronized with the server.

## Scope

### 1. Local-only server

Bind HTTP/WebSocket listeners to `127.0.0.1`, preventing accidental exposure
on Wi-Fi or Ethernet. Keep the preferred-port fallback behavior. The launcher
already probes `127.0.0.1`, so no launcher compatibility change is required.

### 2. Safe, validated profile persistence

Create a small storage module with these responsibilities:

- Resolve safe profile names and paths.
- Read JSON with a clear, non-crashing API error when a file is malformed.
- Validate that save input is a plain object and within a reasonable payload
  shape before writing.
- Write to a temporary file in the same directory, then rename it into place.
  The existing `.bak` is retained as the immediately previous known-good
  snapshot.
- Serialize save operations per profile so overlapping browser saves cannot
  interleave.

The JSON shape remains deliberately permissive: it requires a JSON object but
does not discard future or historical fields.

### 3. Safer process control

Replace the global `taskkill /im node.exe` behavior with a launcher-owned PID
file. On startup the server writes its PID; the stop script reads it, verifies
the process is Node running this app's `server.js`, stops only that process,
then removes the PID file. A missing or stale PID produces a harmless message.

### 4. Client reliability and maintainability

- Remove the unmatched header closing tag.
- Give static assets a conservative Content Security Policy compatible with
  the existing inline handlers and CDN dependencies; this is an incremental
  guardrail, not a UI rewrite.
- Extract the server's storage and listener setup into focused modules while
  retaining the current `/api/load`, `/api/save`, `/api/profiles`, and
  `/api/exchange-rate` request/response contracts.
- Add timeouts to exchange-rate requests, retain stored rates if providers are
  unavailable, and avoid writing a profile unless a valid fetched rate changed.

### 5. Verification baseline

Use Node's built-in test runner (`node --test`) so no new test framework or
runtime dependency is needed. Add tests for profile-name safety, missing/new
profiles, malformed JSON handling, backup/atomic-write behavior, validation,
and loopback binding. Add `test` and `check` package scripts; `check` performs
syntax validation of the server and browser JavaScript.

## Data Flow

```text
Browser -> existing API -> storage service -> temp JSON -> atomic rename
                              |                    \
                              +-> previous JSON -> .bak

Existing profile JSON -> browser -> full document save -> same profile fields
```

On a failed save, the original JSON remains present and the endpoint returns a
clear error. The browser continues showing its in-memory data and its existing
save-status behavior can report failure.

## Error Handling

- Invalid profile names and invalid save payloads return HTTP 400.
- Corrupted profile JSON returns HTTP 500 with a recovery-oriented message;
  it is never overwritten automatically.
- Disk-write failures return HTTP 500 and preserve the prior file.
- Rate-provider failures are non-fatal and return stored rates where present.
- Startup failure on a port continues through the existing fallback ports,
  always on loopback.

## Non-goals

- No schema migration of financial history.
- No database, cloud sync, login system, bundler, or visual redesign.
- No changes to transaction, invoice, debt, bill, card, budget, or savings
  business rules except fixes required to preserve reliability.

## Files Expected to Change

| File | Purpose |
| --- | --- |
| `server.js` | Compose the loopback server, APIs, rate fetch, and lifecycle. |
| `lib/storage.js` | Safe profile resolution, reads, validation, atomic backups/writes. |
| `lib/server-config.js` | Shared paths, defaults, and listener configuration. |
| `test/*.test.js` | Isolated Node test coverage using temporary fixtures. |
| `package.json` | `check` and `test` scripts. |
| `Stop Black Book.bat` | Stop only the Black Book Node process. |
| `public/index.html` | Header markup correction. |
| `README.md` | Update local-only, recovery, and verification documentation. |

## Acceptance Criteria

1. Existing profiles load unchanged and remain readable after ordinary saves.
2. The app listens only on `127.0.0.1` on its selected preferred port.
3. A failed write cannot replace a valid profile with a partial file; `.bak`
   contains the immediate prior version after a successful overwrite.
4. Stopping Black Book does not stop unrelated Node programs.
5. `npm run check` and `npm test` pass without accessing personal profile data.
6. The current launcher, browser UI, and public API paths continue to work.
