# Development

## Prerequisites

- Node.js 20.19+ (22 LTS recommended)
- pnpm 9.15+ (`corepack enable`)
- For desktop work: a platform supported by Electron 33 (Windows, macOS, Linux)

```bash
git clone https://github.com/woxlo1/ResourcePack-Converter.git
cd ResourcePack-Converter
pnpm install
```

`.npmrc` sets `node-linker=hoisted` so Electron and Playwright resolve
dependencies from the workspace root reliably.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` | Vite dev server for the browser app (`127.0.0.1:5173`). |
| `pnpm dev:desktop` | Vite dev server plus Electron with `RPC_DEV_SERVER_URL`. |
| `pnpm build` | Build web and desktop. |
| `pnpm typecheck` | `tsc -p tsconfig.json --noEmit`. |
| `pnpm lint` / `pnpm lint:fix` | ESLint over the workspace. |
| `pnpm test` | All Vitest projects. |
| `pnpm test:unit` | `tests/unit`. |
| `pnpm test:integration` | `tests/integration`. |
| `pnpm test:security` | `tests/security`. |
| `pnpm test:e2e` | Build web, then Playwright Chromium. |
| `pnpm test:e2e:desktop` | Build desktop, then Playwright Electron. |
| `pnpm verify` | Lint, typecheck, tests, build. |
| `pnpm package:desktop` | Unpacked app via electron-builder. |
| `pnpm dist:desktop` | Installers via electron-builder. |
| `pnpm icons` | Regenerate icons and favicons from `apps/desktop/build/icon.svg`. |

Install Playwright browsers once per machine:

```bash
pnpm exec playwright install chromium
```

Desktop E2E uses the Electron binary from `node_modules`; no browser download
is needed for that suite.

## Repository layout

See [architecture.md](architecture.md). In short:

- engine packages are pure TypeScript and must not import React, DOM or
  Electron;
- `@rpc/ui` owns all screens and state;
- `apps/web` and `apps/desktop` are thin entry points;
- `version-data` is data, validated by tests.

### Path aliases

Vite, Vitest, esbuild and TypeScript each map `@rpc/<package>` to
`packages/<package>/src/index.ts`. If you add a package, update:

- `tsconfig.base.json` (`paths`)
- `vitest.config.ts`
- `apps/web/vite.config.ts`
- `apps/desktop/vite.config.ts`

The desktop esbuild bundles `main.ts` / `preload.ts` separately and only marks
`electron` as external.

## Testing

### Unit and integration

Vitest runs in Node. Integration tests build real ZIPs in memory and execute the
full pipeline:

```bash
pnpm test -- tests/integration/convert-pipeline.test.ts
```

The main fixture lives in `tests/fixtures/pack.ts` and mirrors the E2E fixture.
When you change conversion behavior, update both if the expected output
changes.

### End-to-end

Web E2E generates its fixture with JSZip (`tests/e2e/helpers.ts`) so Playwright
does not need Vitest aliases. The suite asserts the full workflow: import,
analysis, configure, convert, ZIP download, output contents and report
download.

Desktop E2E launches the built Electron app and covers:

- `app://bundle/` loading and the preload bridge;
- native save, clipboard and ZIP picker with stubbed dialogs;
- filename sanitization (`../escape.zip` → `escape.zip`);
- a full conversion with a clean renderer console.

Run `pnpm build:desktop` before `pnpm test:e2e:desktop` (the script does this
for you).

### Security tests

`tests/security/zip-security.test.ts` covers path traversal, absolute paths,
duplicate entries, compression-ratio bombs, declared-size lies, file-count and
size limits, and input immutability. `tests/unit/desktop-security.test.ts`
covers IPC validation and renderer path resolution.

## Adding a conversion rule

1. Add metadata to `version-data/migrations/rules.json` (ID, name, description,
   kind, `introducedIn`, source URL).
2. Implement the rule in `packages/converter/src/rules/<area>.ts`.
3. Register it in `packages/converter/src/rules/index.ts`.
4. Add planning logic so the UI can preview the action before conversion.
5. Add unit tests for the conversion and an integration assertion if it changes
   the end-to-end output.
6. Update [conversion-rules.md](conversion-rules.md).

Metadata and implementations are cross-checked by tests: a rule without an
implementation, or an implementation without metadata, fails CI.

## Adding a version family

1. Add the entry to the correct `version-data/versions/*.json` file.
2. Use `resourcePackFormat` as a number (`46`) or `{ "major": 69, "minor": 0 }`
   for formats with a minor component.
3. List every release that shares the format.
4. Add or update migration rule IDs if the family introduces a behavior.
5. Run `pnpm test` — registry tests validate ordering and uniqueness.

Sources are linked in each entry and in the rule metadata. Prefer the Minecraft
Wiki pack-format history as the reference.

## Code style

- TypeScript strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
  Use `import type` for type-only imports.
- Keep engine packages free of side effects; export pure functions.
- Normalize archive paths with the helpers in `@rpc/archive`; never join
  untrusted paths manually.
- Errors use `RpcError` with a stable code and an i18n message key.
- UI text goes through `packages/ui/src/i18n.ts`; add both `en` and `ja`
  entries.
- Components stay small; shared primitives live in `components.tsx`.
- No AI APIs, telemetry or runtime network calls.

## Git workflow

`main` is protected. Work on a feature branch and open a pull request:

```bash
git switch main
git pull --ff-only
git switch -c feat/my-change
# commit...
git push -u origin feat/my-change
```

Conventions:

- Branch names and commit messages in English.
- [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `perf:`.
- One logical change per PR; keep the description focused.
- CI must pass (`pnpm verify`, web E2E, desktop E2E).
- Squash merge only.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

| Job | Runner | Steps |
| --- | --- | --- |
| `verify` | ubuntu-latest | install, lint, typecheck, Vitest, build |
| `e2e-web` | ubuntu-latest | build web, install Chromium, Playwright |
| `e2e-desktop` | windows-latest | build desktop, Playwright Electron |

Artifacts (`playwright-report`, `test-results`) are uploaded on failure.

`.github/workflows/pages.yml` deploys the static web build to GitHub Pages on
every push to `main`. `.github/workflows/release.yml` builds installers for
Windows, Linux and macOS plus the web archive when a `v*` tag is pushed. See
[release.md](release.md).

## Packaging

`apps/desktop/package.json` holds the electron-builder configuration
(`appId`, targets, asar, files, icons). `pnpm dist:desktop` builds the renderer
and main process first, then runs electron-builder for the current platform.
macOS and Linux installers must be produced on their respective platforms.

Electron is pinned to an exact version (`33.4.11`) because electron-builder 26
refuses to infer a version from a semver range. Bump it deliberately and run
`pnpm package:desktop` afterwards.

Icons are committed under `apps/desktop/build/` and `apps/web/public/`; run
`pnpm icons` after changing `icon.svg`. Signing and release steps are covered
in [release.md](release.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot find module '@rpc/...'` | Check the alias lists above and run `pnpm install`. |
| Electron window is blank | Run `pnpm build:desktop`; check that `dist/index.html` exists. |
| Module worker fails in Electron | The renderer must be loaded from `app://bundle/`, not `file://`. |
| Playwright says browser is missing | `pnpm exec playwright install chromium`. |
| Desktop E2E times out on Linux CI | It runs on `windows-latest`; local Linux needs a display or xvfb. |
| Stale Vite cache | Delete `node_modules/.vite` and rebuild. |
