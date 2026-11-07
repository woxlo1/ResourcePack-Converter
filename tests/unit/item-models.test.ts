import { describe, expect, it } from 'vitest';
import { packFormat } from '@rpc/core';
import { convertItemModel, inferPullKind } from '@rpc/converter';

const TARGET_46 = packFormat(46);
const TARGET_55 = packFormat(55);

function convert(model: Record<string, unknown>, itemId = 'test_item', target = TARGET_46) {
  return convertItemModel(model, itemId, 'minecraft', target);
}

describe('legacy item model conversion', () => {
  it('returns null when there are no overrides', () => {
    expect(convert({ parent: 'item/generated' })).toBeNull();
    expect(convert({ overrides: [] })).toBeNull();
  });

  it('refuses to convert before format 46', () => {
    const outcome = convert(
      { overrides: [{ predicate: { damage: 0.5 }, model: 'item/damaged' }] },
      'test_item',
      packFormat(45),
    );
    expect(outcome).not.toBeNull();
    expect(outcome && 'reason' in outcome).toBe(true);
    if (outcome && 'reason' in outcome) expect(outcome.reason).toContain('46');
  });

  it('creates a base model reference and folds overrides in order', () => {
    const outcome = convert({
      overrides: [
        { predicate: { custom_model_data: 1 }, model: 'item/custom' },
        { predicate: { damage: 0.5 }, model: 'item/damaged' },
      ],
    });
    expect(outcome).not.toBeNull();
    if (!outcome || 'reason' in outcome) throw new Error('Expected conversion');

    const model = outcome.itemDefinition.model as any;
    expect(model.type).toBe('minecraft:range_dispatch');
    expect(model.property).toBe('minecraft:damage');
    expect(model.normalize).toBe(true);
    expect(model.entries[0].threshold).toBe(0.5);
    expect(model.entries[0].model).toEqual({ type: 'minecraft:model', model: 'minecraft:item/damaged' });
    expect(model.fallback.type).toBe('minecraft:range_dispatch');
    expect(model.fallback.property).toBe('minecraft:custom_model_data');
    expect(model.fallback.index).toBe(0);
    expect(model.fallback.fallback).toEqual({ type: 'minecraft:model', model: 'minecraft:item/test_item' });
  });

  it('keeps the last matching override outermost (last wins)', () => {
    const outcome = convert({
      overrides: [
        { predicate: { custom_model_data: 1 }, model: 'item/first' },
        { predicate: { custom_model_data: 2 }, model: 'item/second' },
      ],
    });
    if (!outcome || 'reason' in outcome) throw new Error('Expected conversion');
    const model = outcome.itemDefinition.model as any;
    expect(model.entries[0].threshold).toBe(2);
    expect(model.fallback.entries[0].threshold).toBe(1);
    expect(model.fallback.fallback.model).toBe('minecraft:item/test_item');
  });

  it('maps lefthanded to a select on main_hand', () => {
    const outcome = convert({
      overrides: [{ predicate: { lefthanded: true }, model: 'item/left' }],
    });
    if (!outcome || 'reason' in outcome) throw new Error('Expected conversion');
    const model = outcome.itemDefinition.model as any;
    expect(model.type).toBe('minecraft:select');
    expect(model.property).toBe('minecraft:main_hand');
    expect(model.cases[0].when).toBe('left');
  });

  it('maps charged to has_component and adds ignore_default from format 55', () => {
    const before = convert({ overrides: [{ predicate: { charged: true }, model: 'item/charged' }] });
    const after = convert(
      { overrides: [{ predicate: { charged: true }, model: 'item/charged' }] },
      'test_item',
      TARGET_55,
    );
    if (!before || 'reason' in before || !after || 'reason' in after) {
      throw new Error('Expected conversions');
    }
    const beforeModel = before.itemDefinition.model as any;
    const afterModel = after.itemDefinition.model as any;
    expect(beforeModel.property).toBe('minecraft:has_component');
    expect(beforeModel.component).toBe('minecraft:charged_projectiles');
    expect(beforeModel.ignore_default).toBeUndefined();
    expect(afterModel.ignore_default).toBe(true);
  });

  it('approximates pulling, blocking and throwing with using_item', () => {
    for (const key of ['pulling', 'blocking', 'throwing']) {
      const outcome = convert({ overrides: [{ predicate: { [key]: true }, model: 'item/using' }] });
      if (!outcome || 'reason' in outcome) throw new Error(`Expected conversion for ${key}`);
      const model = outcome.itemDefinition.model as any;
      expect(model.property).toBe('minecraft:using_item');
      expect(outcome.warnings.join(' ')).toContain(key);
    }
  });

  it('maps pull to crossbow/pull for crossbows and use_duration otherwise', () => {
    const crossbow = convert({
      parent: 'item/crossbow',
      overrides: [{ predicate: { pull: 0.5 }, model: 'item/crossbow_pulling' }],
    });
    const bow = convert({
      parent: 'item/bow',
      overrides: [{ predicate: { pull: 0.5 }, model: 'item/bow_pulling' }],
    });
    if (!crossbow || 'reason' in crossbow || !bow || 'reason' in bow) {
      throw new Error('Expected conversions');
    }
    const crossbowModel = crossbow.itemDefinition.model as any;
    const bowModel = bow.itemDefinition.model as any;
    expect(crossbowModel.property).toBe('minecraft:crossbow/pull');
    expect(bowModel.property).toBe('minecraft:use_duration');
    expect(bowModel.scale).toBe(0.05);
  });

  it('keeps the model untouched when a predicate has no verified equivalent', () => {
    const outcome = convert({
      parent: 'item/generated',
      overrides: [
        { predicate: { damage: 0.5 }, model: 'item/damaged' },
        { predicate: { trim_type: 'gold' }, model: 'item/trimmed' },
      ],
    });
    expect(outcome).not.toBeNull();
    if (!outcome || !('reason' in outcome)) throw new Error('Expected unsupported outcome');
    expect(outcome.unsupportedKeys).toContain('trim_type');
    expect(outcome.reason).toContain('trim_type');
  });

  it('rejects malformed override entries', () => {
    const noPredicate = convert({ overrides: [{ model: 'item/x' }] });
    const noModel = convert({ overrides: [{ predicate: { damage: 0.5 } }] });
    const emptyPredicate = convert({ overrides: [{ predicate: {}, model: 'item/x' }] });
    for (const outcome of [noPredicate, noModel, emptyPredicate]) {
      expect(outcome && 'reason' in outcome).toBe(true);
    }
  });

  it('infers the pull kind from id, parent and textures', () => {
    expect(inferPullKind('crossbow', {})).toBe('crossbow');
    expect(inferPullKind('bow', {})).toBe('bow');
    expect(inferPullKind('test_item', { parent: 'item/bow' })).toBe('bow');
    expect(inferPullKind('test_item', { textures: { layer0: 'item/crossbow_standby' } })).toBe('crossbow');
    expect(inferPullKind('test_item', {})).toBe('unknown');
  });
});
