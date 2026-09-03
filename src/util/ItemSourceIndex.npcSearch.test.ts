import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { getItemSourceIndex, searchNpcSources } from '#/util/ItemSourceIndex.js';

// issue #102: searchNpcSources() matches against the full NPC display-name
// universe (every real .npc name=, via loadAllNpcConfigs()) rather than
// just drop-/spawn-covered names, then independently looks up dropsByNpc
// and the pooled/area-grouped npcSpawnAreasByName for each match.

before(() => {
    getItemSourceIndex(true);
});

test('empty query returns no results', () => {
    assert.deepEqual(searchNpcSources(''), []);
    assert.deepEqual(searchNpcSources('   '), []);
});

test('full-universe search matches a non-combat, non-spawn-covered NPC and reports both empty states without erroring', () => {
    const results = searchNpcSources('duckling');

    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Duckling');
    assert.deepEqual(results[0].dropGroups, []);
    assert.deepEqual(results[0].spawnAreas, []);
});

test('a drop-and-spawn-covered NPC ("Man", post-#101) renders both sections', () => {
    const results = searchNpcSources('man').filter(r => r.name === 'Man');

    assert.equal(results.length, 1);
    const man = results[0];

    assert.ok(man.dropGroups.length > 0, 'expected "Man" to have at least one drop group');
    assert.ok(
        man.dropGroups.every(g => g.drops.every(d => d.source === 'Man')),
        'expected every drop row under "Man" to carry source "Man"'
    );
    assert.ok(man.spawnAreas.length > 0, 'expected "Man" to have spawn areas');
    assert.ok(
        man.spawnAreas.every(a => a.locations.length > 0),
        'expected each spawn area row to carry at least one location for Show on Map'
    );
});

test('a display name resolving to structurally distinct drop tables ("Dark wizard") renders as separate subsections', () => {
    const results = searchNpcSources('dark wizard');

    assert.equal(results.length, 1);
    const dw = results[0];

    assert.equal(dw.dropGroups.length, 2, 'expected two distinct drop groups for "Dark wizard" (bearded_dark_wizard, young_dark_wizard)');
    const byTrigger = new Map(dw.dropGroups.map(g => [g.triggerKey, g]));

    assert.equal(byTrigger.get('bearded_dark_wizard')?.combatLevel, 20);
    assert.equal(byTrigger.get('young_dark_wizard')?.combatLevel, 7);
    assert.ok(byTrigger.get('bearded_dark_wizard')!.drops.every(d => d.triggerKey === 'bearded_dark_wizard'));
    assert.ok(byTrigger.get('young_dark_wizard')!.drops.every(d => d.triggerKey === 'young_dark_wizard'));
});

test('search is case-insensitive, substring, and underscore-normalized, matching searchItemSources needle logic', () => {
    assert.ok(searchNpcSources('MAN').some(r => r.name === 'Man'));
    assert.ok(searchNpcSources('dark_wizard').some(r => r.name === 'Dark wizard'));
    assert.ok(searchNpcSources('wiz').some(r => r.name === 'Dark wizard'));
});

test('a substring query can match more than one distinct NPC display name', () => {
    const results = searchNpcSources('guard');
    const names = new Set(results.map(r => r.name));

    assert.ok(names.has('Guard'));
    assert.ok(names.size > 1, 'expected "guard" to match more than one distinct NPC display name');
});
