// issue #151: wires FishingSpotCatalog.ts's pure functions to live game
// state -- finding the fishing spot NPC the player is standing next to,
// reading each reachable fish's real success_low/success_high off the
// compiled cache (never hardcoded), and returning the {fish, percent}
// entries NetworkPlayer.updateFishingSpot() sends to the client.
import CategoryType from '#/cache/config/CategoryType.js';
import InvType from '#/cache/config/InvType.js';
import NpcType from '#/cache/config/NpcType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import ParamType from '#/cache/config/ParamType.js';
import StructType from '#/cache/config/StructType.js';
import ObjType from '#/cache/config/ObjType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { computeCatchPercent, getReachableSpecies, resolveFishingSpotKey } from '#/engine/entity/FishingSpotCatalog.js';
import Npc from '#/engine/entity/Npc.js';
import Player from '#/engine/entity/Player.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import World from '#/engine/World.js';

// Real interaction range for a fishing spot in the .rs2 scripts is a single
// tile (e.g. lavafish.rs2's `if (npc_range(coord) > 1) { p_aprange(1); return; }`)
const FISHING_SPOT_INTERACTION_DISTANCE = 1;

// Cached ParamType ids, resolved lazily on first use -- ParamType.load()
// only runs once at server boot, well before any player can trigger this.
let fishingStructParamId = -1;
let successLowParamId = -1;
let successHighParamId = -1;

function ensureParamIdsResolved(): void {
    if (fishingStructParamId !== -1) {
        return;
    }

    fishingStructParamId = ParamType.getId('fishing_struct');
    successLowParamId = ParamType.getId('success_low');
    successHighParamId = ParamType.getId('success_high');
}

function findNearbyFishingSpot(player: Player): Npc | null {
    let closest: Npc | null = null;
    let closestDistance = FISHING_SPOT_INTERACTION_DISTANCE + 1;

    for (const npc of World.npcs) {
        if (npc.level !== player.level) {
            continue;
        }

        const npcType = NpcType.get(npc.type);
        if (!npcType || npcType.name !== 'Fishing spot') {
            continue;
        }

        const distance = CoordGrid.distanceTo(player, npc);
        if (distance <= FISHING_SPOT_INTERACTION_DISTANCE && distance < closestDistance) {
            closest = npc;
            closestDistance = distance;
        }
    }

    return closest;
}

function successRangeFor(fishDebugname: string): { low: number; high: number } | null {
    const fishId = ObjType.getId(fishDebugname);
    if (fishId === -1) {
        return null;
    }

    const fishType = ObjType.get(fishId);
    const structId = ParamHelper.getIntParam(fishingStructParamId, fishType, -1);
    if (structId === -1) {
        return null;
    }

    const struct = StructType.get(structId);
    if (!struct) {
        return null;
    }

    return {
        low: ParamHelper.getIntParam(successLowParamId, struct, 0),
        high: ParamHelper.getIntParam(successHighParamId, struct, 0)
    };
}

export interface FishingSpotCatchEntry {
    readonly fish: number;
    readonly percent: number;
}

// Returns [] when the player isn't near a spot this feature covers (no spot
// nearby, an unrecognized/non-struct-backed spot, or no valid tool held) --
// the caller treats [] as "clear the Active Spot card".
export function computeFishingSpotCatches(player: Player): FishingSpotCatchEntry[] {
    ensureParamIdsResolved();

    const spotNpc = findNearbyFishingSpot(player);
    if (!spotNpc) {
        return [];
    }

    const npcType = NpcType.get(spotNpc.type);
    const category = npcType.category >= 0 ? CategoryType.get(npcType.category) : null;
    const spotKey = resolveFishingSpotKey(category?.debugname ?? null, npcType.debugname ?? null);
    if (!spotKey) {
        return [];
    }

    const fishingLevel = player.levels[PlayerStat.FISHING];

    const reachable = getReachableSpecies(
        spotKey,
        toolDebugname => {
            const toolId = ObjType.getId(toolDebugname);
            return toolId !== -1 && player.invTotal(InvType.INV, toolId) > 0;
        },
        fishingLevel
    );

    const entries: FishingSpotCatchEntry[] = [];
    for (const entry of reachable) {
        const fishId = ObjType.getId(entry.fish);
        const range = successRangeFor(entry.fish);
        if (fishId === -1 || !range) {
            continue;
        }

        entries.push({
            fish: fishId,
            percent: computeCatchPercent(range.low, range.high, fishingLevel)
        });
    }

    return entries;
}
