# Architecture

ResourcePack Converter is a pnpm monorepo. The conversion engine is plain
TypeScript with no DOM or Electron dependencies, so the same code runs in a
browser worker, in Electron's renderer, and in Node-based tests.

## Layers

```text
apps/web ─┐
apps/desktop ─┤
              ├─> packages/ui ─> packages/shared ─> converter
              │                        │              analyzer
              │                        │              validator
              │                        │              archive
              │                        └─────────────> report
              │                                       version-registry
              └─────────────────────────────────────> core
```

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@rpc/core` | Domain types, `PackFormat` math, errors, archive limits. No I/O. | — |
| `@rpc/version-registry` | Loads `version-data/versions/*.json`, resolves version IDs and format ranges, exposes migration metadata. | core |
| `@rpc/archive` | Safe ZIP directory parsing (including ZIP64), folder input normalization, signature checks and deterministic ZIP writing. | core, JSZip |
| `@rpc/analyzer` | Classifies every file, detects the pack format and version family, collects references and import warnings. | core, version-registry |
| `@rpc/converter` | Rule registry, plan generation and rule execution. Pure functions over `PackArchive`. | core, version-registry |
| `@rpc/validator` | JSON Schema validation with AJV plus reference checks on the output archive. | core |
| `@rpc/report` | Renders `ConversionReport` as JSON, HTML, plain text or CSV. | core |
| `@rpc/shared` | The end-to-end pipeline (`inspectArchive`, `buildConversionPlan`, `runConversion`, `convertZip`, `convertFiles`) and report assembly. | all engine packages |
| `@rpc/ui` | Screens, state (Zustand), i18n, theming, worker protocol/client, platform adapters. | core, shared, report, version-registry, React |
| `@rpc/web` | Static browser entry point and Vite config. | ui |
| `@rpc/desktop` | Electron main/preload, desktop platform adapter, Vite renderer entry point. | ui |

`version-data/` is shared data, not a package. It holds the version families,
rule metadata and JSON schemas used by the registry, converter and validator.

## Data flow

```text
ZIP bytes / folder entries
        │
        ▼
readZip / readFileEntries        (archive limits, safe paths, duplicates)
        │
        ▼
analyzeArchive                   (classification, format detection, references)
        │
        ▼
createConversionPlan             (per-file action + ordered rule list)
        │
        ▼
runConversion                    (rule execution, progress, cancellation)
        │
        ▼
validateArchive                  (schemas + references on output)
        │
        ▼
buildReport / exportReport       (file reports + summary + renderers)
        │
        ▼
writeZip                         (deterministic ZIP, fixed timestamps/order)
```

### Archive model

A `PackArchive` is an immutable map of normalized forward-slash paths to
`Uint8Array` contents. Reading a ZIP produces a `PackArchive`; conversion
produces a new one. Input bytes are never mutated, which makes "do not modify
the source" a structural guarantee rather than a convention.

### Planning vs. execution

`createConversionPlan` is a dry run. It evaluates the source format, target
format and rule applicability and returns a `PlanItem` per file:

- `convert` — one or more rules will rewrite the file;
- `preserve` — copied unchanged (unknown files, already-compatible files);
- `drop` — intentionally excluded (only when unknown-file preservation is off);
- `validate` — checked but not rewritten;
- `unsupported` — recognized but not safely convertible; the file is preserved.

The UI shows this plan before conversion, so nothing is written blindly.

### Rules

Each rule is a small module with metadata (ID, target format, source link) and
an `apply` function over a single file or the archive. Rules are registered in
one place and cross-checked against `version-data/migrations/rules.json` by
tests: a rule in the metadata must have exactly one implementation and vice
versa. This keeps documentation and behavior in sync.

### Reports

`@rpc/shared` merges plan items, rule results and validation issues into a
`FileReport` per output path. `totalFiles` is always the number of reported
files, so it equals the sum of the status counters (successful, warnings,
failures, skipped, unsupported). Reports are pure data; `@rpc/report` only
formats them.

## UI runtime

The React UI never loads archives on the main thread.

```text
UI thread                          Worker
─────────                          ──────
ConversionWorkerClient  ──post──>  worker.ts
  import-zip / import-folder         sources: Map<sourceId, archive>
  plan                               controllers: Map<sourceId, AbortController>
  convert  <──progress/logs──
  cancel
  dispose
```

- The worker owns loaded source archives and returns a `sourceId`; the UI only
  keeps metadata and the analysis.
- Conversion results include the report and output ZIP bytes. The output buffer
  is transferred back so it is not copied across the boundary.
- Requests are correlated by numeric IDs. Errors are serialized with a stable
  `RpcError` code and an i18n message key.
- Cancellation aborts the active `AbortController`; the worker still emits a
  consistent cancelled result and report.

State lives in a persisted Zustand store (`rpc.app-state.v1`): locale, theme,
settings, history (max 50) and the current session. The worker is created in a
`useEffect` inside `ServicesProvider`, which keeps React StrictMode from
creating duplicate workers.

### Platform adapters

`PlatformAdapter` abstracts saving files, copying text and (optionally) native
ZIP/folder pickers. `createWebPlatform` uses downloads, the Clipboard API and
hidden file inputs. The desktop adapter calls `window.rpcDesktop`, which the
preload script exposes. Screens only depend on the interface, so both apps
share every screen.

## Desktop shell

```text
main process                     renderer
────────────                     ────────
BrowserWindow  ── app://bundle ──> React app
IPC handlers   <── invoke ──────── preload (window.rpcDesktop)
  rpc:save-file
  rpc:copy-text
  rpc:pick-zip
  rpc:pick-folder
```

- The production renderer is served from a privileged `app://bundle/` scheme
  instead of `file://`, which allows module workers and a strict CSP.
- In development the window loads the Vite dev server at
  `http://127.0.0.1:5173`; `RPC_DEV_SERVER_URL` selects this mode.
- Main and preload are bundled to CommonJS with esbuild; the renderer is a
  normal Vite build. `electron-builder` packages `dist/` and `dist-electron/`.
- Security settings and IPC validation are described in
  [security.md](security.md).

## Determinism

- ZIP entries are written in sorted path order with fixed timestamps.
- JSON is serialized with stable key order where the rule rewrites it.
- No randomness, time-of-day or locale affects output bytes.
- Reports include timestamps, but the converted pack does not.

## Testing strategy

| Layer | Tool | Location |
| --- | --- | --- |
| Unit | Vitest | `tests/unit` |
| Integration (full pipeline) | Vitest | `tests/integration` |
| Security (ZIP/IPC) | Vitest | `tests/security` |
| Web E2E | Playwright (Chromium) | `tests/e2e` |
| Desktop E2E | Playwright Electron | `tests/e2e-desktop` |

E2E fixtures are generated with JSZip so Playwright does not depend on the
workspace path aliases used by Vitest. Desktop tests stub native dialogs through
`app.evaluate` and exercise the real IPC bridge.
