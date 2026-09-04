import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import KillCredit from '#/network/game/server/model/KillCredit.js';

export default class KillCreditEncoder extends ServerGameMessageEncoder<KillCredit> {
    prot = ServerGameProt.KILL_CREDIT;

    encode(buf: Packet, message: KillCredit): void {
        buf.p2(message.npcType);
    }
}
