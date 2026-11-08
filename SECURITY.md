# Security Policy

## Supported versions

The project is pre-1.0. Security fixes are applied to the `main` branch and the
latest release.

## Reporting a vulnerability

Please **do not** open a public issue, discussion or pull request for a
security problem.

Report privately through GitHub's
[private vulnerability reporting](https://github.com/woxlo1/ResourcePack-Converter/security/advisories/new)
for this repository. If that is unavailable, contact the maintainer
[@woxlo1](https://github.com/woxlo1) directly.

Include as much of the following as you can:

- affected version, commit or branch;
- a description of the issue and its impact;
- steps to reproduce, ideally with a minimal ZIP;
- whether the issue affects the web app, the desktop app, or both;
- any suggested mitigation.

Please avoid attaching real personal data. A synthetic archive is enough.

## What to expect

- Acknowledgement within a few days.
- An assessment and, when confirmed, a fix on a private branch.
- A coordinated disclosure once a release is available.
- Credit in the advisory unless you prefer to remain anonymous.

## Scope

In scope:

- ZIP parsing and extraction (path traversal, Zip Slip, ZIP bombs, duplicate
  entries, size-limit bypass);
- Electron sandbox escape, IPC validation, CSP or navigation bypass;
- renderer path resolution and `app://` protocol issues;
- denial of service through crafted packs;
- report rendering (HTML injection in exported reports).

Out of scope:

- vulnerabilities in Minecraft itself or in third-party shaders/textures;
- malware contained in a resource pack that the converter faithfully
  preserves;
- issues that require an already-compromised machine or a modified build;
- social engineering.

## Security design

See [docs/security.md](docs/security.md) for the threat model, archive limits,
Electron hardening and IPC validation rules.

## Safe harbor

We will not pursue legal action for good-faith research that follows this
policy, avoids privacy violations, avoids destructive testing, and gives us
reasonable time to fix the issue before disclosure.
