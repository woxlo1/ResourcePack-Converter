# Conversion rules

Every conversion is driven by metadata in
`version-data/migrations/rules.json`. A rule has an ID, a kind
(`conversion`, `validation` or `preservation`), the format that introduced the
behavior, and a source link. Tests enforce a one-to-one match between the
metadata and the implementations in `packages/converter/src/rules`.

## Version and format table

Pack formats come from the Minecraft Wiki pack-format history. The registry
uses 26 families; `min_format` / `max_format` are written from format 69
(1.21.9) onward.

| Version family | Releases | Resource pack format |
| --- | --- | --- |
| 1.6.1 – 1.8.9 | 1.6.1, 1.7.10, 1.8.9 | 1 |
| 1.9 – 1.10.2 | 1.9, 1.10.2 | 2 |
| 1.11 – 1.12.2 | 1.11, 1.12.2 | 3 |
| 1.13 – 1.14.4 | 1.13, 1.14.4 | 4 |
| 1.15 – 1.16.1 | 1.15, 1.16.1 | 5 |
| 1.16.2 – 1.16.5 | 1.16.2, 1.16.5 | 6 |
| 1.17 – 1.17.1 | 1.17, 1.17.1 | 7 |
| 1.18 – 1.18.2 | 1.18, 1.18.2 | 8 |
| 1.19 – 1.19.2 | 1.19, 1.19.2 | 9 |
| 1.19.3 | 1.19.3 | 12 |
| 1.19.4 | 1.19.4 | 13 |
| 1.20 – 1.20.1 | 1.20, 1.20.1 | 15 |
| 1.20.2 | 1.20.2 | 18 |
| 1.20.3 – 1.20.4 | 1.20.3, 1.20.4 | 22 |
| 1.20.5 – 1.20.6 | 1.20.5, 1.20.6 | 32 |
| 1.21 – 1.21.1 | 1.21, 1.21.1 | 34 |
| 1.21.2 – 1.21.3 | 1.21.2, 1.21.3 | 42 |
| 1.21.4 | 1.21.4 | 46 |
| 1.21.5 | 1.21.5 | 55 |
| 1.21.6 | 1.21.6 | 63 |
| 1.21.7 – 1.21.8 | 1.21.7, 1.21.8 | 64 |
| 1.21.9 – 1.21.10 | 1.21.9, 1.21.10 | 69.0 |
| 1.21.11 | 1.21.11 | 75.0 |
| 26.1 – 26.1.2 | 26.1, 26.1.1, 26.1.2 | 84.0 |
| 26.2 | 26.2 | 88.0 |
| 26.3 | 26.3 | 97.1 |

A pack may declare a range instead of a single number. The analyzer accepts
`supported_formats` (legacy) as either `[min, max]` or `[major, minor]`, and
`min_format` / `max_format` (format 69+). Two-element arrays are interpreted as
a range first and fall back to a major/minor pair when the range is invalid.

## Rule list

| ID | Kind | Since | Behavior |
| --- | --- | --- | --- |
| `rpc:pack-mcmeta/format` | conversion | 1 | Sets `pack_format` to the target while preserving description, overlays, filters, features, language and unknown fields. |
| `rpc:pack-mcmeta/min-max-format` | conversion | 69 | Removes `supported_formats` and writes `min_format` / `max_format`. |
| `rpc:textures/folder-rename` | conversion | 4 | Renames `textures/blocks` → `textures/block` and `textures/items` → `textures/item`, updating references. |
| `rpc:item-model/overrides` | conversion | 46 | Converts legacy `overrides` into `assets/<ns>/items/<id>.json` and removes `overrides` from the model. |
| `rpc:fonts/legacy-unicode` | validation | 15 | Detects the removed `legacy_unicode` provider and reports it as unsupported. |
| `rpc:textures/png-only` | validation | 22 | Verifies texture payloads are PNG. |
| `rpc:fonts/validate` | validation | 1 | Checks provider types, fields and referenced textures. |
| `rpc:shaders/verify-only` | validation | 42 | Detects shader/post-effect files; no automatic rewrite is attempted. |
| `rpc:sounds/validate` | validation | 1 | Checks `sounds.json` structure and referenced audio files. |
| `rpc:blockstates/validate` | validation | 1 | Checks blockstate structure and model references. |
| `rpc:atlases/validate` | validation | 12 | Checks atlas sources and references. |
| `rpc:textures/validate` | validation | 1 | Checks textures and `.mcmeta` animation metadata. |
| `rpc:unknown/preserve` | preservation | 1 | Copies unrecognized files unchanged unless preservation is disabled. |

## pack.mcmeta

The converter parses `pack.mcmeta` as JSON and updates only the format fields:

- Targets below 69 write `pack_format` and remove `min_format` / `max_format`
  when they are not needed.
- Targets 69 and newer write `min_format` and `max_format` as
  `[major, minor]` arrays and remove `supported_formats`.
- Description, `overlays`, `filter`, `features`, `language` and unknown keys are
  kept.
- Invalid JSON is reported as a failure; the original bytes are preserved.

## Item models

Legacy item models use an `overrides` array. Modern versions (format 46+)
replace this with a separate item model definition in
`assets/<namespace>/items/<id>.json`.

The converter:

1. Reads `assets/<ns>/models/item/<id>.json`.
2. Resolves the fallback model as `<ns>:item/<id>`.
3. Evaluates overrides top-to-bottom. Each override wraps the previous chain,
   so the last matching override is the outermost branch.
4. Writes `assets/<ns>/items/<id>.json` containing `{ "model": ... }`.
5. Removes `overrides` from the source model, leaving its textures and parent
   intact.

If `assets/<ns>/items/<id>.json` already exists, the model is left untouched
and a warning is emitted. If any predicate has no verified equivalent, the
entire model is preserved and reported as `UNSUPPORTED`; the converter never
produces a partial definition.

### Predicate mapping

| Legacy predicate | Modern property | Notes |
| --- | --- | --- |
| `custom_model_data` | `minecraft:range_dispatch` / `minecraft:custom_model_data` | `index: 0` |
| `damage` | `minecraft:range_dispatch` / `minecraft:damage` | `normalize: true` |
| `cooldown` | `minecraft:range_dispatch` / `minecraft:cooldown` | |
| `time` | `minecraft:range_dispatch` / `minecraft:time` | `source: "daytime"` |
| `angle` | `minecraft:range_dispatch` / `minecraft:compass` | Approximated with `target: "spawn"` + warning |
| `pull` (bow) | `minecraft:range_dispatch` / `minecraft:use_duration` | `scale: 0.05` |
| `pull` (crossbow) | `minecraft:range_dispatch` / `minecraft:crossbow/pull` | Detected from item/model names |
| `pull` (unknown) | `minecraft:range_dispatch` / `minecraft:use_duration` | Warning emitted |
| `charged` | `minecraft:condition` / `minecraft:has_component` | `component: "minecraft:charged_projectiles"`; `ignore_default` from format 55 |
| `damaged` | `minecraft:condition` / `minecraft:damaged` | |
| `broken` | `minecraft:condition` / `minecraft:broken` | |
| `cast` | `minecraft:condition` / `minecraft:fishing_rod/cast` | |
| `lefthanded` | `minecraft:select` / `minecraft:main_hand` | `left` / `right` |
| `pulling` | `minecraft:condition` / `minecraft:using_item` | Approximated + warning |
| `blocking` | `minecraft:condition` / `minecraft:using_item` | Approximated + warning |
| `throwing` | `minecraft:condition` / `minecraft:using_item` | Approximated + warning |

Predicates that are explicitly unsupported — `trim_type`, `firework`, `level`,
`filled`, `tooting`, `brushing`, `honey_level` — and any unknown predicate
cause the whole model to be preserved and reported.

### Example

```json
{
  "parent": "item/handheld",
  "textures": { "layer0": "items/diamond_sword" },
  "overrides": [
    { "predicate": { "custom_model_data": 1 }, "model": "item/diamond_sword_custom" },
    { "predicate": { "damage": 0.5 }, "model": "item/diamond_sword_damaged" }
  ]
}
```

becomes `assets/minecraft/items/diamond_sword.json`:

```json
{
  "model": {
    "type": "minecraft:range_dispatch",
    "property": "minecraft:damage",
    "normalize": true,
    "entries": [
      { "threshold": 0.5, "model": { "type": "minecraft:model", "model": "minecraft:item/diamond_sword_damaged" } }
    ],
    "fallback": {
      "type": "minecraft:range_dispatch",
      "property": "minecraft:custom_model_data",
      "index": 0,
      "entries": [
        { "threshold": 1, "model": { "type": "minecraft:model", "model": "minecraft:item/diamond_sword_custom" } }
      ],
      "fallback": { "type": "minecraft:model", "model": "minecraft:item/diamond_sword" }
    }
  }
}
```

## Textures

- `textures/blocks/**` and `textures/items/**` are moved to `textures/block/**`
  and `textures/item/**` for format 4+.
- PNG payloads are verified by signature and left byte-identical. The converter
  never recompresses, resizes or re-encodes images.
- `.png.mcmeta` animation files are preserved and validated.
- Missing texture references to custom namespaces are reported; missing
  `minecraft:` assets are treated as game-provided and ignored.

## Sounds, fonts, blockstates and atlases

These files are validated rather than rewritten:

- **Sounds** — `sounds.json` must be an object of sound events with valid
  categories and `name` references; referenced `.ogg` files are checked by
  signature.
- **Fonts** — provider `type` and required fields are checked, along with
  referenced textures. Removed providers such as `legacy_unicode` are reported
  as unsupported because the glyph data cannot be reconstructed.
- **Blockstates** — `variants` / `multipart` structure and model references are
  checked.
- **Atlases** — atlas sources, sprite entries and referenced textures are
  checked against the archive.

## Shaders

Post-effect and shader files are preserved. The converter does not attempt to
translate GLSL between versions; it validates JSON where a schema exists and
reports anything that looks version-specific as a warning.

## Unknown files

Files outside the recognized resource pack layout are copied unchanged by
default. Disabling "preserve unknown files" drops them intentionally and marks
them as skipped in the report.

## Report statuses

| Status | Meaning |
| --- | --- |
| `SUCCESS` | File was converted or validated without problems. |
| `WARNING` | Converted or preserved, but a human should review the message (approximated predicate, existing target, missing custom reference). |
| `FAILED` | The rule could not complete, or validation found an error. |
| `SKIPPED` | Deliberately preserved or dropped without conversion. |
| `UNSUPPORTED` | Recognized, but no faithful automatic conversion exists. The file is preserved. |

`totalFiles` equals the number of file reports, which is always the sum of
these counters.
