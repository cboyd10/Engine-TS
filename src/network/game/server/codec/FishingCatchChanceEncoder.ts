import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import FishingCatchChance from '#/network/game/server/model/FishingCatchChance.js';

export default class FishingCatchChanceEncoder extends ServerGameMessageEncoder<FishingCatchChance> {
    prot = ServerGameProt.FISHING_CATCH_CHANCE;

    encode(buf: Packet, message: FishingCatchChance): void {
        buf.p1(message.entries.length);
        for (const entry of message.entries) {
            buf.p2(entry.fish);
            buf.p1(entry.percent);
        }
    }
}
