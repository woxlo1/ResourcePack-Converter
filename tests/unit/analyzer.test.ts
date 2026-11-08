import { describe, expect, it } from 'vitest';
import { inspectArchive } from '@rpc/shared';
import { jsonBytes, legacyPackFiles, packFromFiles } from '../fixtures/pack';

describe('dependency analysis', () => {
  it('treats missing minecraft namespace assets as game-provided', () => {
    const archive = packFromFiles('builtins.zip', legacyPackFiles());
    const { analysis } = inspectArchive(archive);

    expect(analysis.missingReferences.some((edge) => edge.to.startsWith('assets/minecraft/'))).toBe(false);
  });

  it('reports missing references in custom namespaces', () => {
    const files = legacyPackFiles();
    files.push({
      path: 'assets/custom/models/item/thing.json',
      data: jsonBytes({ parent: 'custom:item/base', textures: { layer0: 'custom:item/thing' } }),
    });
    const archive = packFromFiles('custom.zip', files);
    const { analysis } = inspectArchive(archive);

    expect(analysis.missingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: 'assets/custom/models/item/base.json',
          kind: 'model-parent',
        }),
        expect.objectContaining({
          to: 'assets/custom/textures/item/thing.png',
          kind: 'model-texture',
        }),
      ]),
    );
  });
});
