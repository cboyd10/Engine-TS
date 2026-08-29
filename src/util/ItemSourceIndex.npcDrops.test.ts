import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { getItemSourceIndex, searchItemSources } from '#/util/ItemSourceIndex.js';

// These tests exercise the real pilot NPC drop-source data transcribed for
// issue #57 (content/scripts/drop tables/webdata/*.dropdata), reading it via
// a content checkout resolved relative to Environment.build.srcDir (default
// '../content' - see package.json's "test" script / engine.yml CI for how
// that's satisfied). Expected rates are hand-derived directly from
// content/scripts/drop tables/scripts/*.rs2 and shared_droptables.rs2 - see
// webdata/README.md for the excluded branches (Ring of Wealth, Legends'
// Quest, clue tertiary rolls) and how the ~randomjewel
// coordz(coord) > 6400 branch was resolved.

let index: ReturnType<typeof getItemSourceIndex>;

before(() => {
    index = getItemSourceIndex(true);
});

test('fire_giant drops steel_axe at 3/128 (direct debugname trigger, no category)', () => {
    const drops = index.dropsByNpc.get('firegiant') ?? [];
    const steelAxe = drops.find(d => d.item === 'Steel axe');

    assert.ok(steelAxe, 'expected firegiant to drop Steel axe');
    assert.equal(steelAxe?.rate, '3/128');
    assert.equal(steelAxe?.chance, 3 / 128);
    assert.equal(steelAxe?.quantity, 1);
});

test('fire_giant guaranteed big_bones drop is always included at chance 1', () => {
    const drops = index.dropsByNpc.get('firegiant') ?? [];
    const bigBones = drops.find(d => d.item === 'Big bones');

    assert.ok(bigBones, 'expected firegiant to always drop Big bones');
    assert.equal(bigBones?.chance, 1);
    assert.equal(bigBones?.rate, 'Always');
});

test('fire_giant composes the nested ~randomherb subtable (19/128 * 32/128)', () => {
    const drops = index.dropsByNpc.get('firegiant') ?? [];
    const guam = drops.find(d => d.item === 'Unidentified guam');

    assert.ok(guam, 'expected firegiant to be able to drop Unidentified guam via ~randomherb');
    // 19/128 chance to roll into ~randomherb, then 32/128 chance of guam within it
    assert.equal(guam?.chance, (19 / 128) * (32 / 128));
});

test('fire_giant composes the doubly-nested ~ultrarare_getitem -> ~randomjewel chain', () => {
    const drops = index.dropsByNpc.get('firegiant') ?? [];
    // fire_giant reaches Uncut sapphire via two independent paths: directly
    // through its own ~randomjewel subtable (11/128 * 32/128), and via
    // ~ultrarare_getitem -> ~randomjewel (1/128 * 20/128 * 32/128) - both are
    // real, separate rows, not a single merged one.
    const sapphireRows = drops.filter(d => d.item === 'Uncut sapphire');
    const viaUltrarare = sapphireRows.find(d => d.chance === (1 / 128) * (20 / 128) * (32 / 128));

    assert.equal(sapphireRows.length, 2, 'expected two distinct Uncut sapphire rows (direct + via ~ultrarare_getitem)');
    assert.ok(viaUltrarare, 'expected the ~ultrarare_getitem -> ~randomjewel composed chance to be present');
});

test('_citizen category resolves to every real (non-_unpack-orphaned) citizen debugname', () => {
    const manDrops = index.dropsByItem.get('coins')?.filter(d => d.triggerKey === '_citizen') ?? [];
    const coveredDebugnames = new Set(manDrops.flatMap(d => d.npcDebugnames));

    for (const expected of ['man', 'man2', 'man3', 'woman', 'woman2', 'woman3', 'al_kharid_man']) {
        assert.ok(coveredDebugnames.has(expected), `expected _citizen category to cover debugname "${expected}"`);
    }
});

test('_citizen category shows one pooled "Citizen" row, not one row per debugname', () => {
    const manDrops = index.dropsByItem.get('coins') ?? [];
    const citizenSources = new Set(manDrops.filter(d => d.triggerKey === '_citizen').map(d => d.source));

    assert.equal(citizenSources.size, 1, 'expected a single generic label for the _citizen category, not one per debugname');
});

test('al_kharid_warrior (literal debugname trigger) is not merged into the _citizen category label', () => {
    const drops = index.dropsByNpc.get('al_kharid_warrior') ?? [];

    assert.ok(drops.length > 0, 'expected al_kharid_warrior to have its own drop rows');
    assert.ok(
        drops.every(d => d.triggerKey === 'al_kharid_warrior'),
        'al_kharid_warrior rows should carry their own trigger key'
    );
    assert.ok(
        drops.every(d => d.source === 'Al-Kharid warrior'),
        'al_kharid_warrior should display its own npc name, not the citizen category label'
    );
});

test('_citizen_burthorpe is a distinct category from _citizen, sharing the same table', () => {
    const manDrops = index.dropsByItem.get('coins') ?? [];
    const burthorpeDebugnames = new Set(manDrops.filter(d => d.triggerKey === '_citizen_burthorpe').flatMap(d => d.npcDebugnames));

    for (const expected of ['death_man_outdoors1', 'death_man_outdoors2', 'death_man_indoors1', 'death_man_indoors2', 'death_woman_outdoors1', 'death_woman_outdoors2', 'death_woman_indoors1']) {
        assert.ok(burthorpeDebugnames.has(expected), `expected _citizen_burthorpe to cover debugname "${expected}"`);
    }
    assert.ok(!burthorpeDebugnames.has('man'), '_citizen_burthorpe should not pull in plain _citizen members');
});

test('bear guaranteed drops (fur, raw_bear_meat) appear with no random-table entries', () => {
    const bearDrops = index.dropsByNpc.get('brownbear') ?? [];

    assert.ok(bearDrops.some(d => d.item === 'Fur' && d.chance === 1));
    assert.ok(bearDrops.some(d => d.item === 'Raw bear meat' && d.chance === 1));
});

test('guard, cow, and chicken pilot data resolve with their hand-computed rates', () => {
    const guardDrops = index.dropsByNpc.get('guard1') ?? [];
    const grain = guardDrops.find(d => d.item === 'Grain');
    assert.equal(grain?.rate, '1/128');

    const cowDrops = index.dropsByNpc.get('cow') ?? [];
    assert.ok(cowDrops.some(d => d.item === 'Raw beef' && d.chance === 1));
    assert.ok(cowDrops.some(d => d.item === 'Cow hide' && d.chance === 1));

    const chickenDrops = index.dropsByNpc.get('chicken') ?? [];
    assert.ok(chickenDrops.some(d => d.item === 'Raw chicken' && d.chance === 1));
    const feather15 = chickenDrops.find(d => d.item === 'Feather' && d.quantity === 15);
    assert.equal(feather15?.rate, '1/4');
});

test('dark_wizard pilot data resolves both level variants as separate literal-debugname sources', () => {
    const bearded = index.dropsByNpc.get('bearded_dark_wizard') ?? [];
    const young = index.dropsByNpc.get('young_dark_wizard') ?? [];

    assert.ok(bearded.length > 0 && young.length > 0);
    assert.ok(bearded.every(d => d.source === 'Dark wizard'));
    assert.ok(young.every(d => d.source === 'Dark wizard'));
    // both variants can drop earthrune,36 but at different rates - listed separately, not merged
    const beardedEarthrune36 = bearded.find(d => d.item === 'Earthrune' && d.quantity === 36);
    const youngEarthrune36 = young.find(d => d.item === 'Earthrune' && d.quantity === 36);
    assert.equal(beardedEarthrune36?.rate, '1/32');
    assert.equal(youngEarthrune36?.rate, '1/32');
});

test('drop sources are grouped one row per (source, area) pair, not per raw spawn location', () => {
    const guamRows = (index.dropsByNpc.get('man') ?? []).filter(d => d.item === 'Unidentified guam');

    assert.ok(guamRows.length > 0, 'expected man to be able to drop Unidentified guam');
    const areas = guamRows.map(d => d.area);
    assert.equal(new Set(areas).size, areas.length, 'expected at most one row per distinct area for this source+item');
    for (const row of guamRows) {
        assert.ok(row.locations.length >= 1, 'expected each area row to carry at least one location for Show on Map');
    }
});

test('dropsByItem is wired into searchItemSources results', () => {
    const results = searchItemSources('steel axe');

    assert.ok(results.drops.length > 0, 'expected searchItemSources to surface NPC drop sources');
    assert.ok(results.drops.some(d => d.item === 'Steel axe'));
});
