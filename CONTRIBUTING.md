# Contributing

Thanks for helping improve ResourcePack Converter. This project converts
Minecraft: Java Edition resource packs with deterministic, documented rules.

## Before you start

- Read [docs/development.md](docs/development.md) for setup and commands.
- Read [docs/conversion-rules.md](docs/conversion-rules.md) before changing
  conversion behavior.
- For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a
  public issue.

## Workflow

1. Fork the repository (or create a branch if you have write access).
2. Branch from `main` using an English name:
   `feat/item-model-predicates`, `fix/zip64-directory`, `docs/security`.
3. Make one focused change.
4. Add or update tests.
5. Run the checks:

   ```bash
   pnpm verify
   pnpm test:e2e
   pnpm test:e2e:desktop   # if you touched the desktop app
   ```

6. Commit with a Conventional Commit message.
7. Open a pull request against `main` and fill in the template.

Do not commit directly to `main`. Pull requests are squash-merged.

## Commit messages

Use English and the Conventional Commits format:

```text
feat: convert item model overrides
fix: reject duplicate ZIP entries
docs: document min_format migration
test: cover ZIP64 central directory
chore: update dependencies
```

The subject is imperative and under ~72 characters. Add a body when the change
needs context or has user-visible consequences.

## What we look for

- **Correctness first.** A conversion either produces a faithful result or
  reports the file as unsupported. Never guess.
- **Tests.** New rules need unit tests and, when they change output, an
  integration or E2E assertion.
- **Documentation.** Update the rule metadata and
  [docs/conversion-rules.md](docs/conversion-rules.md).
- **Security.** Treat archives as untrusted. Use the safe-path helpers, respect
  limits, and validate IPC payloads.
- **Consistency.** Match the surrounding code style and naming.
- **No runtime network or AI calls.** The converter must work offline.

## Adding a rule or version

See the step-by-step guides in
[docs/development.md](docs/development.md#adding-a-conversion-rule) and
[docs/development.md](docs/development.md#adding-a-version-family).

Rule metadata lives in `version-data/migrations/rules.json`; implementations
live in `packages/converter/src/rules`. Tests require a one-to-one match.

## UI changes

- Add translations for both English and Japanese in
  `packages/ui/src/i18n.ts`.
- Keep screens usable with keyboard only and at narrow widths.
- Do not move archive work onto the main thread; use the worker client.
- Verify the browser and desktop builds.

## Reporting bugs

Use the bug report template. Include:

- the source pack format and target version;
- what you expected and what happened;
- the report JSON/HTML if possible;
- a minimal reproduction ZIP if it can be shared.

## Code of conduct

Be respectful and constructive. Harassment, discrimination and personal attacks
are not tolerated. Maintainers may remove comments or contributions that do not
meet this standard.
