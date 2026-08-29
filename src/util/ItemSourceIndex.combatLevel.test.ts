import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { getItemSourceIndex } from '#/util/ItemSourceIndex.js';

// issue #80: combatLevel is derived from each debugname's real `vislevel=`
// line in the .npc files (content/scripts/_unpack/225/all.npc), the same
// field the client tooltip and Npc.ts's hunt-aggression check already trust.
//
// dark_wizard.rs2 dispatches [ai_queue3,bearded_dark_wizard] and
// [ai_queue3,young_dark_wizard] as two separate, non-underscore (literal
// debugname) trigger keys - each resolves to a single-debugname source.
// bearded_dark_wizard's .npc entry reads vislevel=20.
//
// The _citizen category (label "Citizen", covering man/man2/man3/woman/
// woman2/woman3/al_kharid_man - see the npcDrops test file) is a
// multi-debugname source whose members all carry vislevel=2 in the .npc
// files, so it exercises the "every debugname shares the same vislevel"
// branch (a single number, not a range).
//
// _citizen_burthorpe (death_man_outdoors1/2, death_man_indoors1/2,
// death_woman_outdoors1/2, death_woman_indoors1 - the Burthorpe death
// squad) is a second multi-debugname category source whose members carry
// vislevel 4, 5, or 6 depending on debugname, so it exercises the "min-max
// range" branch.

let index: ReturnType<typeof getItemSourceIndex>;

before(() => {
    index = getItemSourceIndex(true);
});

test('bearded_dark_wizard (single-debugname source) reports its real vislevel=20 as a plain number', () => {
    const drops = index.dropsByNpc.get('bearded_dark_wizard') ?? [];

    assert.ok(drops.length > 0, 'expected bearded_dark_wizard to have drop rows');
    assert.ok(
        drops.every(d => d.combatLevel === 20),
        'expected every bearded_dark_wizard row to report combatLevel 20'
    );
});

test('young_dark_wizard (single-debugname source) reports its real vislevel=7 as a plain number', () => {
    const drops = index.dropsByNpc.get('young_dark_wizard') ?? [];

    assert.ok(drops.length > 0, 'expected young_dark_wizard to have drop rows');
    assert.ok(
        drops.every(d => d.combatLevel === 7),
        'expected every young_dark_wizard row to report combatLevel 7'
    );
});

test('_citizen category (man/woman family, all vislevel=2) collapses to a single number, not a range', () => {
    const manDrops = (index.dropsByItem.get('coins') ?? []).filter(d => d.triggerKey === '_citizen');

    assert.ok(manDrops.length > 0, 'expected the _citizen category to have coins drop rows');
    assert.ok(
        manDrops.every(d => d.combatLevel === 2),
        'expected every _citizen row to report combatLevel 2 (uniform across the family)'
    );
});

test('_citizen_burthorpe category (vislevel 4-6 across its debugnames) reports a "min-max" range string', () => {
    const burthorpeDrops = (index.dropsByItem.get('coins') ?? []).filter(d => d.triggerKey === '_citizen_burthorpe');

    assert.ok(burthorpeDrops.length > 0, 'expected the _citizen_burthorpe category to have coins drop rows');
    assert.ok(
        burthorpeDrops.every(d => d.combatLevel === '4-6'),
        'expected every _citizen_burthorpe row to report combatLevel "4-6"'
    );
});
