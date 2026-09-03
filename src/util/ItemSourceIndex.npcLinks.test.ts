import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import ejs from 'ejs';

import { getItemSourceIndex, searchItemSources, searchNpcSources } from '#/util/ItemSourceIndex.js';

// issue #102: /items' NPC Drop Sources rows link their NPC name to
// /npc?q=<name>, and /npc's drop-list rows link their item name to
// /items?q=<item> - verifies both hrefs render correctly for a real,
// known item/NPC pair (Coins <-> Dark wizard) by rendering the actual
// view templates, not just the underlying search functions.

before(() => {
    getItemSourceIndex(true);
});

test('/items renders a working /npc?q= link for a known NPC drop source', async () => {
    const results = searchItemSources('Coins');
    const html = await ejs.renderFile('view/items.ejs', { query: 'Coins', results }, { async: true });

    assert.ok(html.includes('href="/npc?q=Dark%20wizard"'), 'expected /items to link "Dark wizard" to /npc?q=Dark%20wizard');
});

test('/npc renders a working /items?q= link for a known item drop', async () => {
    const results = searchNpcSources('Dark wizard');
    const html = await ejs.renderFile('view/npc.ejs', { query: 'Dark wizard', results }, { async: true });

    assert.ok(html.includes('href="/items?q=Coins"'), 'expected /npc to link "Coins" to /items?q=Coins');
});

test('/npc renders without error for a query with no matches', async () => {
    const results = searchNpcSources('zzznotarealnpc');
    const html = await ejs.renderFile('view/npc.ejs', { query: 'zzznotarealnpc', results }, { async: true });

    assert.ok(html.includes('No NPC found matching'));
});

test('/npc renders the no-query prompt when results is null', async () => {
    const html = await ejs.renderFile('view/npc.ejs', { query: '', results: null }, { async: true });

    assert.ok(html.includes('Enter an NPC name above to search.'));
});
