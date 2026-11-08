# ResourcePack Converter

A rule-based Minecraft: Java Edition resource pack converter for the desktop and
the browser. It reads a pack ZIP (or folder), detects its pack format, plans
every change, converts the files, validates the result, and produces a
file-by-file report. Everything runs locally — no uploads, no AI services, no
network calls at runtime.

[![CI](https://github.com/woxlo1/ResourcePack-Converter/actions/workflows/ci.yml/badge.svg)](https://github.com/woxlo1/ResourcePack-Converter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Highlights

- **Deterministic conversions** — every transformation comes from a documented
  rule in `version-data/migrations/rules.json`; the same input always produces
  the same output.
- **Transparent** — a per-file report explains what changed, what was skipped,
  what was preserved and what could not be converted automatically.
- **Safe by default** — Zip Slip, path traversal, ZIP bombs, duplicate entries
  and oversized archives are rejected before conversion starts. Input archives
  are never modified.
- **Desktop + Web** — one React UI (`@rpc/ui`) shared by an Electron app and a
  static web build.
- **Bilingual UI** — English and Japanese, dark and light themes, responsive
  layout, keyboard-friendly controls.
- **Offline** — no telemetry, no analytics, no external requests.

## Supported conversions

The registry covers 26 resource pack format families, from the legacy formats
through the current `min_format` / `max_format` era.

| Area | What the converter does |
| --- | --- |
| `pack.mcmeta` | Updates `pack_format`; for format 69+ writes `min_format` / `max_format` and removes `supported_formats` while preserving description, overlays, filters and unknown fields. |
| Texture folders | Renames `textures/blocks` → `textures/block` and `textures/items` → `textures/item` for format 4+. |
| Item models | Converts legacy `overrides` in `models/item/*.json` into `items/*.json` item model definitions for format 46+, including `range_dispatch` chains for damage, pull, charge and similar predicates. |
| Blockstates | Validates and preserves blockstate JSON, rewriting references when a model is migrated. |
| Sounds | Validates `sounds.json`, sound event references and `.ogg` signatures. |
| Fonts | Validates font providers and texture references; reports removed providers such as `legacy_unicode` as unsupported instead of guessing. |
| Shaders / atlases | Preserves post-effect and atlas files, validating JSON structure where a schema exists. |
| Unknown files | Preserved byte-for-byte by default (configurable). |

Models that use predicates without a verified equivalent (for example
`trim_type`, `firework`, `level`, `filled`, `tooting`, `brushing`,
`honey_level`) are left untouched and reported as `UNSUPPORTED` — the converter
never silently drops behavior it cannot reproduce.

See [docs/conversion-rules.md](docs/conversion-rules.md) for the full rule list
and version table.

## Getting started

Requirements:

- Node.js **20.19+** (22 LTS recommended)
- pnpm **9.15+** (`corepack enable` is enough)

```bash
pnpm install
```

Run the web app in development:

```bash
pnpm dev:web
# http://127.0.0.1:5173
```

Run the desktop app in development (Vite renderer + Electron main process):

```bash
pnpm dev:desktop
```

Build both apps:

```bash
pnpm build
```

Create an unpacked desktop build in `apps/desktop/release/`:

```bash
pnpm package:desktop
```

Create installers for the current platform:

```bash
pnpm dist:desktop
```

## Using the app

1. **Import** — drop a `.zip`, choose a ZIP, or pick a folder. The archive is
   parsed and validated in a Web Worker.
2. **Analysis** — inspect the detected format, version family, file counts and
   any import warnings.
3. **Configure** — choose the target version and conversion options, then
   refresh the plan to see exactly which rules will run.
4. **Preview** — review per-file actions before writing anything.
5. **Convert** — follow progress, stream logs, cancel at any time. The source
   archive stays untouched.
6. **Result** — download the converted ZIP and a report (JSON, HTML, TXT or
   CSV), or copy the report to the clipboard.

Settings and the last 50 conversions are stored locally. Nothing leaves the
machine.

## Project layout

```text
apps/
  web/                 Vite + React browser app
  desktop/             Electron main/preload + Vite renderer
packages/
  core/                Domain types, errors, pack-format math
  version-registry/    Version families and migration metadata
  archive/             Safe ZIP/folder reading and deterministic ZIP writing
  analyzer/            Pack classification, references, format detection
  converter/           Rule implementations and conversion planning
  validator/           Schema and reference validation
  report/              JSON / HTML / TXT / CSV report rendering
  shared/              End-to-end pipeline used by the worker
  ui/                  Screens, state, i18n, worker client, platform adapters
version-data/          Version tables, rule metadata, JSON schemas
tests/                 Unit, integration, security and Playwright E2E tests
docs/                  Architecture, rules, security and development docs
```

More detail: [docs/architecture.md](docs/architecture.md).

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev:web` | Start the web dev server on `127.0.0.1:5173`. |
| `pnpm dev:desktop` | Start Vite and launch Electron against it. |
| `pnpm build` | Production build for web and desktop. |
| `pnpm typecheck` | TypeScript project check (no emit). |
| `pnpm lint` | ESLint over the whole workspace. |
| `pnpm test` | Vitest unit, integration and security tests. |
| `pnpm test:e2e` | Build the web app and run Playwright. |
| `pnpm test:e2e:desktop` | Build the desktop app and run Electron E2E tests. |
| `pnpm verify` | Lint + typecheck + tests + build (what CI runs). |
| `pnpm package:desktop` | Unpacked Electron app via electron-builder. |
| `pnpm dist:desktop` | Platform installers via electron-builder. |

## Security

The converter treats resource packs as untrusted input:

- ZIP entries are normalized and rejected when they escape the archive root
  (Zip Slip), collide with existing paths, use absolute paths or reserved
  device names.
- Archive size, uncompressed size, entry count and compression ratio are
  bounded.
- PNG and OGG payloads are validated by signature; files are never recompressed.
- The Electron renderer runs with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, a strict CSP and a minimal,
  validated IPC bridge.

Details and the threat model: [docs/security.md](docs/security.md). To report a
vulnerability, follow [SECURITY.md](SECURITY.md).

## Limitations

- Conversions are rule-based. Predicates, shader features or provider types
  without a verified target equivalent are preserved and reported, not guessed.
- Image data is not re-encoded, so textures keep their original resolution.
- The web app requires a modern browser with module workers and the File API.
- Very large packs are bounded by the configurable archive limits.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/development.md](docs/development.md) before opening a pull request.

## License

[MIT](LICENSE)
