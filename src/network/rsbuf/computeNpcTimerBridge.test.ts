import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addNpc, addPlayer, computeNpc, npcInfo, removeNpc, removePlayer, NpcInfoProt } from '#/network/rsbuf/index.js';

// issue #157: computeNpc() bridges the authoritative engine Npc's per-tick state
// onto the separate, network-facing rsbuf Npc mirror (network/rsbuf/npc.ts) that
// NpcRenderer actually encodes from. When issue #150 added NpcInfoProt.TIMER,
// timerMaskTicks was never threaded through this bridge as a parameter -- the
// mirror's field stayed at its `-1` default forever, so `NpcInfoTimer(-1)` got
// encoded as an unsigned `-1 & 0xffff = 65535`, which the client then displayed
// as a ~655 minute countdown. npcInfoTimer.test.ts didn't catch this because it
// sets `timerMaskTicks` directly on a manually-constructed mirror Npc, bypassing
// this bridge entirely. This test goes through the real addNpc/computeNpc/npcInfo
// singleton path end-to-end, the way World.ts actually drives it.
test('computeNpc() bridges a real armed timerMaskTicks through to the encoded NpcInfo bytes', () => {
    const nid = 16300;
    const pid = 2040;

    try {
        addNpc(nid, 1);
        // custom (issue #157): npc.coord defaults to (0,0,0); moving it to a
        // different zone (x=8 -> zone 1, vs zone 0) is what makes computeNpc()
        // register it into the ZoneMap so a nearby player can discover it --
        // mirrors how a real npc's first position update behaves.
        computeNpc(
            8,
            0,
            0,
            nid,
            1, // ntype
            false, // tele
            false, // jump
            -1, // runDir
            -1, // walkDir
            true, // active
            NpcInfoProt.TIMER, // masks
            -1, // faceEntity
            -1, // faceX
            -1, // faceZ
            -1, // orientationX
            -1, // orientationZ
            -1, // damageTaken
            -1, // damageType
            -1, // damageTaken2
            -1, // damageType2
            -1, // currentHitpoints
            -1, // baseHitpoints
            -1, // animId
            -1, // animDelay
            null, // say
            -1, // graphicId
            -1, // graphicHeight
            -1, // graphicDelay
            402 // timerMaskTicks -- the value fishing_movement.rs2 arms (280-530 range)
        );

        addPlayer(pid);
        const bytes = npcInfo(0, pid, 0, 0, true);

        // NpcInfoEncoder.writeBlocks() always writes NpcInfoProt.TIMER last among
        // an npc's masks (see info.ts), and this test's world has exactly one
        // npc/player pair, so the final 2 bytes of the encoded packet are always
        // the TIMER payload -- a plain 2-byte big-endian ticks-remaining value.
        assert.ok(bytes.length >= 2, 'expected npcInfo() to encode at least the TIMER payload');
        const high = bytes[bytes.length - 2];
        const low = bytes[bytes.length - 1];
        const ticksRemaining = (high << 8) | low;

        assert.equal(ticksRemaining, 402, `expected the armed 402 ticks to survive the bridge, got ${ticksRemaining} (65535 means the pre-fix -1 default leaked through)`);
    } finally {
        removeNpc(nid);
        removePlayer(pid);
    }
});
