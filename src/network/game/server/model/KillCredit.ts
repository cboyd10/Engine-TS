import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';

export default class KillCredit extends ServerGameMessage {
    constructor(readonly npcType: number) {
        super();
    }
}
