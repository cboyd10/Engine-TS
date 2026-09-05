import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';

export interface FishingCatchChanceEntry {
    // fish item id (ObjType), not a namedobj string -- resolved server-side
    readonly fish: number;
    // 0-100, already computed server-side (see FishingSpotCatalog.ts's
    // computeCatchPercent()) -- the client never re-derives this
    readonly percent: number;
}

export default class FishingCatchChance extends ServerGameMessage {
    constructor(readonly entries: FishingCatchChanceEntry[]) {
        super();
    }
}
