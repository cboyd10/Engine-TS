import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NpcInfoTimer } from '#/network/rsbuf/messages.js';
import { Npc } from '#/network/rsbuf/npc.js';
import { Packet } from '#/network/rsbuf/packet.js';
import { NpcInfoProt, npcInfoProtIndex } from '#/network/rsbuf/prot.js';
import { NpcRenderer } from '#/network/rsbuf/renderer.js';

// issue #150: generic "ticks remaining" NpcInfoProt.TIMER mask -- covers the
// three risk areas of this change: the new bit's value/index don't collide
// with an existing mask, the message payload encodes correctly, and
// NpcRenderer accounts for the header/payload byte lengths correctly given
// the header is now unconditionally 2 bytes (see NpcRenderer.header()).

test('NpcInfoProt.TIMER occupies a fresh bit beyond the 8 already-used low bits', () => {
    assert.equal(NpcInfoProt.TIMER, 0x100);
    assert.equal(npcInfoProtIndex(NpcInfoProt.TIMER), 8);

    // sanity: doesn't collide with any existing mask bit
    const existing = [NpcInfoProt.DAMAGE2, NpcInfoProt.ANIM, NpcInfoProt.FACE_ENTITY, NpcInfoProt.SAY, NpcInfoProt.DAMAGE, NpcInfoProt.CHANGE_TYPE, NpcInfoProt.SPOT_ANIM, NpcInfoProt.FACE_COORD];
    for (const prot of existing) {
        assert.equal(NpcInfoProt.TIMER & prot, 0);
    }
});

test('NpcInfoTimer encodes a 2-byte big-endian ticks-remaining payload', () => {
    const message = new NpcInfoTimer(350); // 0x015e
    assert.equal(message.test(), 2);
    assert.equal(message.persists(), false);

    const buf = new Packet(message.test());
    message.encode(buf);

    assert.equal(buf.data[0], 0x01);
    assert.equal(buf.data[1], 0x5e);
});

test('NpcRenderer.computeInfo accounts for the TIMER payload and the unconditional 2-byte mask header', () => {
    const renderer = new NpcRenderer();
    const npc = new Npc(1, 0);
    npc.masks = NpcInfoProt.TIMER;
    npc.timerMaskTicks = 500;

    renderer.computeInfo(npc);

    // 2-byte header (NpcRenderer.header() is now always 2, since NpcInfoProt's
    // original 8-bit space had no spare "BIG" flag bit to keep a 1-byte
    // header for masks that don't use TIMER) + 2-byte NpcInfoTimer payload.
    assert.equal(renderer.highdefinitions(npc.nid), 4);
    assert.equal(renderer.has(npc.nid, NpcInfoProt.TIMER), true);

    const buf = new Packet(2);
    renderer.write(buf, npc.nid, NpcInfoProt.TIMER);
    assert.equal(buf.data[0], (500 >> 8) & 0xff);
    assert.equal(buf.data[1], 500 & 0xff);
});

test('NpcRenderer.computeInfo still reports a 2-byte header for masks that do not include TIMER', () => {
    const renderer = new NpcRenderer();
    const npc = new Npc(2, 0);
    npc.masks = NpcInfoProt.ANIM;
    npc.animId = 1;
    npc.animDelay = 0;

    renderer.computeInfo(npc);

    // ANIM payload is 3 bytes (test() on NpcInfoAnim) + the now-unconditional
    // 2-byte header, versus the pre-#150 1-byte header.
    assert.equal(renderer.highdefinitions(npc.nid), 5);
});
