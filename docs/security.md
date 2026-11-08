# Security

Resource packs are untrusted input. A malicious pack can try to escape the
output directory, exhaust memory, overwrite files or attack the desktop shell.
This document describes the controls in place and how to report a problem.

## Threat model

| Asset | Threat | Control |
| --- | --- | --- |
| User files | Zip Slip / path traversal writes outside the output | Path normalization, `..` rejection, absolute path and drive-letter rejection |
| User files | Overwriting the input archive | Input is read into memory; output always goes to a new file chosen by the user |
| Process memory | ZIP bomb / decompression bomb | Size, count and compression-ratio limits enforced before and during extraction |
| Integrity | Duplicate entries hiding content | Duplicate normalized paths rejected |
| Desktop shell | Renderer escaping into Node/Electron APIs | Context isolation, sandbox, no node integration, minimal preload bridge |
| Desktop shell | Malicious IPC payloads | Every IPC argument validated and bounded in the main process |
| Desktop shell | Loading remote or injected content | `app://` origin, strict CSP, navigation and window-open denial |
| Privacy | Data leaving the machine | No network calls, telemetry or AI services at runtime |

## ZIP handling

### Path normalization

Every entry name is normalized before use:

- backslashes become forward slashes;
- leading `./` and duplicate separators are removed;
- absolute paths (`/`, `C:\`, UNC) are rejected;
- any `..` segment is rejected;
- empty names, `.` and trailing separators are rejected;
- NUL bytes and control characters are rejected.

The resulting paths are used as map keys only; nothing is written to disk by
the converter. This makes Zip Slip structurally impossible: there is no
extraction step that joins an untrusted path with a filesystem root.

### Limits

Defaults in `@rpc/core`:

| Limit | Default |
| --- | --- |
| ZIP size | 256 MiB |
| Total uncompressed size | 1 GiB |
| Entry count | 20,000 |
| Single file size | 128 MiB |
| Compression ratio | 500:1 |

The UI exposes file-count and total-size limits in Settings; all other limits
stay fixed. Limits are checked twice:

1. from the central directory before decompression (declared sizes and count);
2. during extraction against actual decompressed bytes, so a forged header
   cannot bypass the check.

A ratio above the limit raises `ZIP_BOMB_SUSPECTED` and aborts the import.

### Duplicate entries

Two entries that normalize to the same path are rejected
(`DUPLICATE_ENTRY`). This prevents a later entry from silently replacing an
earlier one and keeps output deterministic.

### ZIP64

The archive reader parses the ZIP64 end-of-central-directory records and
per-entry extra fields, so large but valid packs are read correctly while the
same limits still apply. A dedicated regression test covers ZIP64 directories.

### Input immutability

`PackArchive` is treated as immutable. Reading produces one archive; conversion
produces a new one. The source bytes are never written back, and the output ZIP
is written to a separate path chosen in the save dialog or downloaded by the
browser.

## Content validation

- PNG and OGG files are identified by signature. A file with a misleading
  extension is reported.
- JSON is parsed with size guards; invalid JSON is reported, not executed.
- No image decoding or recompression happens in the converter, which avoids
  decoder vulnerabilities and preserves original bytes.
- JSON Schema validation uses AJV with the schemas in `version-data/schemas`.
  Schemas are data files shipped with the app; no remote schema loading.

## Electron hardening

`apps/desktop/electron/main.ts`:

```ts
webPreferences: {
  preload: join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  spellcheck: false,
}
```

Additional controls:

- **Privileged scheme** — the packaged renderer is served from
  `app://bundle/`, registered as `standard`, `secure`, `supportFetchAPI` and
  `corsEnabled`. This gives module workers a real origin and allows a strict
  CSP. Paths are resolved with `resolveRendererPath`, which rejects traversal,
  encoded separators and drive/stream separators.
- **CSP** — the production build injects
  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';
  worker-src 'self' blob:; base-uri 'none'; form-action 'none'`.
  Dev mode omits the CSP because Vite HMR needs inline scripts and websockets.
- **Navigation** — `will-navigate` only allows the packaged origin or the
  configured dev server; `setWindowOpenHandler` denies all new windows; webview
  attachment is denied.
- **Permissions** — all permission requests and checks return `false`.
- **No remote content** — no `shell.openExternal` calls except the static
  project link in the Help menu.

### IPC bridge

The preload exposes exactly four functions on `window.rpcDesktop`:

| Method | Validation |
| --- | --- |
| `saveFile(request)` | Trusted sender URL, sanitized single-segment file name, byte array only, `0 < size <= 512 MiB`, MIME normalized |
| `copyText(text)` | Trusted sender URL, string only, `<= 8 MiB` |
| `pickZipFile()` | Trusted sender URL, file must be a regular file `0 < size <= 512 MiB` |
| `pickFolder()` | Trusted sender URL, symlinks skipped, `<= 20,000` files, `<= 512 MiB` total |

`isTrustedSenderUrl` accepts only `app://bundle/` and, in development, the exact
Vite dev-server origin. A renderer loaded from anywhere else cannot call the
bridge.

Save requests are reduced to a single safe path segment:

- path separators are stripped, so `../../evil.zip` becomes `evil.zip`;
- Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…`LPT9`) are
  rejected;
- control characters and `<>:"|?*` are replaced;
- trailing dots and spaces are removed.

The save dialog itself is always user-driven; the app never writes to a path
without confirmation.

### Renderer sandbox

- `sandbox: true` keeps the renderer in a Chromium sandbox even though a
  preload script is used.
- The preload does not expose `ipcRenderer`, `require`, `process` or any
  filesystem API.
- The bridge is a frozen plain object created with `contextBridge`.

## Web app

The web build is a static site. It has no server component, no cookies and no
network requests. Archives are read with the File API and processed in a Web
Worker; downloads use object URLs that are revoked after use. The same archive
limits and path validation apply because the worker uses the same engine.

## Denial of service

Besides archive limits:

- JSON parsing is bounded by the per-file and total-size limits.
- The UI runs conversion in a worker, so a slow pack does not freeze the
  interface.
- Conversion is cancellable; cancellation is checked between files and inside
  long loops.
- Report rendering is linear in the number of files and capped by the archive
  file limit.

## Known limitations

- The converter does not scan file contents for malware. It preserves unknown
  files byte-for-byte, so a pack can still contain arbitrary data; only open
  packs you trust.
- Schema validation catches structural problems, not semantic changes in
  Minecraft itself.
- Dev mode intentionally relaxes CSP and loads from localhost. Never ship a dev
  build.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Follow
[SECURITY.md](../SECURITY.md) and include:

- the affected version or commit;
- a minimal reproduction (a ZIP if possible);
- the impact you observed;
- any suggested fix.

We aim to acknowledge reports within a few days and will credit reporters
unless they prefer to stay anonymous.
