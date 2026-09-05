import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeCatchPercent, FISHING_SPOT_CATALOG, getReachableSpecies, resolveFishingSpotKey } from '#/engine/entity/FishingSpotCatalog.js';

// issue #151: catch-chance % per catchable species.
//
// computeCatchPercent() must match the exact STAT_RANDOM formula in
// PlayerOps.ts:591-600 (`value = floor(low*(99-level)/98) +
// floor(high*(level-1)/98) + 1`), expressed as value / 256 instead of a
// single dice roll. Reference values below are computed by hand from that
// formula using fishing.struct's real shrimp (48/256) and shark (3/40)
// success_low/success_high -- the same two examples cited in the issue.

test('computeCatchPercent matches STAT_RANDOM for shrimp (48/256) at level 1', () => {
    // value = floor(48*(99-1)/98) + floor(256*(1-1)/98) + 1 = floor(48) + 0 + 1 = 49
    // percent = round(49/256*100) = 19
    assert.equal(computeCatchPercent(48, 256, 1), 19);
});

test('computeCatchPercent matches STAT_RANDOM for shrimp (48/256) at level 99', () => {
    // value = floor(48*0/98) + floor(256*98/98) + 1 = 0 + 256 + 1 = 257, clamped to 256
    // percent = round(256/256*100) = 100
    assert.equal(computeCatchPercent(48, 256, 99), 100);
});

test('computeCatchPercent matches STAT_RANDOM for shark (3/40) at level 76 (its min level)', () => {
    // value = floor(3*23/98) + floor(40*75/98) + 1 = 0 + 30 + 1 = 31
    // percent = round(31/256*100) = 12
    assert.equal(computeCatchPercent(3, 40, 76), 12);
});

test('computeCatchPercent clamps a fishing level above 99', () => {
    assert.equal(computeCatchPercent(48, 256, 150), computeCatchPercent(48, 256, 99));
});

test('computeCatchPercent never returns outside 0-100', () => {
    for (const level of [1, 25, 50, 75, 99]) {
        const percent = computeCatchPercent(0, 0, level);
        assert.ok(percent >= 0 && percent <= 100, `percent ${percent} out of range at level ${level}`);
    }
});

test('resolveFishingSpotKey resolves a normal category-based spot', () => {
    assert.equal(resolveFishingSpotKey('saltfish', '_saltfish'), 'saltfish');
});

test('resolveFishingSpotKey resolves the lava eel spot by literal debugname, not category', () => {
    assert.equal(resolveFishingSpotKey(null, '0_45_152_lavafish'), 'lavafish');
});

test('resolveFishingSpotKey returns null for a category with no catalog entry (e.g. karambwan/karambwanji)', () => {
    assert.equal(resolveFishingSpotKey('category_632', '_category_632'), null);
    assert.equal(resolveFishingSpotKey(null, null), null);
});

test('getReachableSpecies returns species reachable with the held tool, filtered by level', () => {
    const held = new Set(['net']);
    const entries = getReachableSpecies('saltfish', tool => held.has(tool), 10);

    assert.deepEqual(
        entries.map(e => e.fish),
        ['raw_shrimp'] // anchovies needs level 15
    );
});

test('getReachableSpecies includes a second species once its minLevel is met', () => {
    const held = new Set(['net']);
    const entries = getReachableSpecies('saltfish', tool => held.has(tool), 15);

    assert.deepEqual(
        entries.map(e => e.fish),
        ['raw_shrimp', 'raw_anchovies']
    );
});

test("getReachableSpecies picks the first held tool in the spot's declared order, not every held tool", () => {
    // holds both net and fishing_rod -- saltfish declares net first
    const held = new Set(['net', 'fishing_rod']);
    const entries = getReachableSpecies('saltfish', tool => held.has(tool), 20);

    assert.deepEqual(
        entries.map(e => e.fish),
        ['raw_shrimp', 'raw_anchovies']
    );
});

test('getReachableSpecies returns [] when the player holds no valid tool for the spot', () => {
    const entries = getReachableSpecies('saltfish', () => false, 99);
    assert.deepEqual(entries, []);
});

test('getReachableSpecies returns [] for an unknown spot key', () => {
    const entries = getReachableSpecies('not_a_real_spot', () => true, 99);
    assert.deepEqual(entries, []);
});

test('memberfish catalog omits big_net (no struct-backed success_low/success_high for its junk table)', () => {
    assert.equal('big_net' in FISHING_SPOT_CATALOG.memberfish, false);
});
