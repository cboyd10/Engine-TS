import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { getItemSourceIndex } from '#/util/ItemSourceIndex.js';

// issue #80: combatLevel is derived from each debugname's real `vislevel=`
// line in the .npc files (content/scripts/_unpack/225/all.npc), the same
// field the client tooltip and Npc.ts's hunt-aggression check already trust.
//
// issue #101: buildNpcDropSources() now partitions each trigger's debugnames
// by their real in-game display name before computing combat level, so the
// range is scoped to a display-name group's own members, not the whole
// trigger's debugname list.
//
// dark_wizard.rs2 dispatches [ai_queue3,bearded_dark_wizard] and
// [ai_queue3,young_dark_wizard] as two separate, non-underscore (literal
// debugname) trigger keys, each a single-debugname source - but both share
// the display name "Dark wizard", so post-#101 they add their own rows to
// the same dropsByNpc key (told apart below via npcDebugnames/triggerKey).
// bearded_dark_wizard's .npc entry reads vislevel=20.
//
// The _citizen category splits post-#101 into "Man" (man/man2/man3/
// al_kharid_man) and "Woman" (woman/woman2/woman3) - see the npcDrops test
// file. Both groups' members all carry vislevel=2, so "Man" exercises the
// "every debugname shares the same vislevel" branch (a single number, not a
// range).
//
// The _guard category splits into a single "Guard" group (guard1
// vislevel=21, guard2 vislevel=22, ardougne_guard vislevel=20 - all display
// name "Guard"), which exercises the "min-max range" branch on real data
// post-partitioning.

let index: ReturnType<typeof getItemSourceIndex>;

before(() => {
    index = getItemSourceIndex(true);
});

test('bearded_dark_wizard (single-debugname source) reports its real vislevel=20 as a plain number', () => {
    const drops = (index.dropsByNpc.get('Dark wizard') ?? []).filter(d => d.npcDebugnames.includes('bearded_dark_wizard'));

    assert.ok(drops.length > 0, 'expected bearded_dark_wizard to have drop rows');
    assert.ok(
        drops.every(d => d.combatLevel === 20),
        'expected every bearded_dark_wizard row to report combatLevel 20'
    );
});

test('young_dark_wizard (single-debugname source) reports its real vislevel=7 as a plain number', () => {
    const drops = (index.dropsByNpc.get('Dark wizard') ?? []).filter(d => d.npcDebugnames.includes('young_dark_wizard'));

    assert.ok(drops.length > 0, 'expected young_dark_wizard to have drop rows');
    assert.ok(
        drops.every(d => d.combatLevel === 7),
        'expected every young_dark_wizard row to report combatLevel 7'
    );
});

test('_citizen "Man" group (man/man2/man3/al_kharid_man, all vislevel=2) collapses to a single number, not a range', () => {
    const manDrops = (index.dropsByItem.get('coins') ?? []).filter(d => d.triggerKey === '_citizen' && d.source === 'Man');

    assert.ok(manDrops.length > 0, 'expected the _citizen "Man" group to have coins drop rows');
    assert.ok(
        manDrops.every(d => d.combatLevel === 2),
        'expected every "Man" group row to report combatLevel 2 (uniform across its own members)'
    );
});

test('_guard category ("Guard": guard1/guard2/ardougne_guard, vislevel 20-22) reports a "min-max" range string scoped to its own members', () => {
    const guardDrops = index.dropsByNpc.get('Guard') ?? [];

    assert.ok(guardDrops.length > 0, 'expected the "Guard" group to have drop rows');
    assert.ok(
        guardDrops.every(d => d.combatLevel === '20-22'),
        'expected every "Guard" row to report combatLevel "20-22"'
    );
});

test('_citizen_burthorpe splits into one group per debugname (each a distinct display name), each reporting its own vislevel - no pooled range', () => {
    const burthorpeDrops = (index.dropsByItem.get('coins') ?? []).filter(d => d.triggerKey === '_citizen_burthorpe');
    const levelBySource = new Map(burthorpeDrops.map(d => [d.source, d.combatLevel]));

    assert.equal(levelBySource.get('Breoca'), 5);
    assert.equal(levelBySource.get('Ocga'), 5);
    assert.equal(levelBySource.get('Unferth'), 6);
    assert.equal(levelBySource.get('Penda'), 5);
    assert.equal(levelBySource.get('Hygd'), 4);
    assert.equal(levelBySource.get('Ceolburg'), 4);
    assert.equal(levelBySource.get('Hild'), 4);
});
