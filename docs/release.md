# Releasing and deployment

## GitHub Pages (browser app)

Every push to `main` runs `.github/workflows/pages.yml`, builds
`apps/web/dist` and deploys it to GitHub Pages:

<https://woxlo1.github.io/ResourcePack-Converter/>

The site is a fully static build. All conversion work happens in the browser's
Web Worker; nothing is uploaded. Pages is configured with **Source: GitHub
Actions**, so no `gh-pages` branch exists.

To deploy manually, run the **Deploy web app** workflow from the Actions tab
(`workflow_dispatch`).

The web build uses relative asset URLs (`base: './'`), so it also works when
served from a sub-path such as the project Pages URL.

## Versioning

The workspace version lives in the root `package.json` and every
`apps/*` / `packages/*` manifest. Keep them in sync. A release tag must match
the version:

```bash
# after merging the version bump
git switch main
git pull --ff-only
git tag v1.0.0
git push origin v1.0.0
```

Pushing a `v*` tag starts `.github/workflows/release.yml`, which:

1. builds the static web app and packs it as
   `resourcepack-converter-web-<tag>.zip`;
2. builds the desktop app on Windows, Linux and macOS and runs
   electron-builder for the configured target:
   - Windows: NSIS installer (`resourcepack-converter-<version>-win-x64.exe`)
   - Linux: AppImage (`resourcepack-converter-<version>-linux-x86_64.AppImage`)
   - macOS: DMG (`resourcepack-converter-<version>-mac-<arch>.dmg`)
3. creates a GitHub Release for the tag and attaches every artifact.

`workflow_dispatch` can rebuild the artifacts without publishing a release;
the `publish` job only runs for tag pushes.

## Local packaging

```bash
pnpm package:desktop   # unpacked app in apps/desktop/release/win-unpacked
pnpm dist:desktop      # installer for the current platform
```

Installers for macOS and Linux should be produced on their own platforms
(electron-builder does not cross-compile DMGs or AppImages reliably).

The application icons are generated from `apps/desktop/build/icon.svg`:

```bash
pnpm icons
```

This writes `icon.png`, `icon.ico`, `icon.icns`, the web favicon and the Apple
touch icon. Commit the generated files; CI does not regenerate them.

## Code signing

Builds are unsigned by default. The release workflow already forwards the
standard electron-builder variables, so signing can be enabled by adding
repository secrets — no workflow change is required.

### Windows (Authenticode)

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.pfx`/`.p12`, or a URL to it |
| `CSC_KEY_PASSWORD` | Password for the certificate |

A standard code-signing certificate (OV or EV) is required. Unsigned
installers still work, but SmartScreen shows an "Unknown publisher" warning.

### macOS (Developer ID + notarization)

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.p12` containing the Developer ID Application certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

electron-builder signs the `.app` and notarizes the DMG when these variables
are present. Without them the DMG is built unsigned and Gatekeeper requires a
manual "Open" on first launch.

> Code signing cannot be completed without a purchased certificate and, for
> macOS, a paid Apple Developer account. The pipeline is ready for both; the
> only missing pieces are the secrets above.

## Verifying a release

1. Check the **Release** workflow is green for the tag.
2. Open the GitHub Release and confirm these assets exist:
   - `resourcepack-converter-<version>-win-x64.exe`
   - `resourcepack-converter-<version>-linux-x86_64.AppImage`
   - `resourcepack-converter-<version>-mac-<arch>.dmg`
   - `resourcepack-converter-web-<tag>.zip`
3. Open <https://woxlo1.github.io/ResourcePack-Converter/> and run one
   conversion to confirm the Pages deployment.
4. Download the installer for your platform, install it and convert a pack.
