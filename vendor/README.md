Browser assets bundled for offline use:

- `chart.umd.min.js`: Chart.js 4.5.1, copied from the pinned npm package. License: `chart-LICENSE.md`.
- `hack/`: Hack 3.3.0, copied from the pinned npm package. License: `hack/LICENSE.md`.
- `xlsx.full.min.js`: SheetJS Community Edition 0.20.3, downloaded from the [official standalone build](https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js). SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`. License: `xlsx-LICENSE.txt`.

These files are served only by the local Black Book server; the app does not require the CDNs to load its interface or import spreadsheets.
