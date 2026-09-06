// issue #151: catch-chance % per catchable species at the player's current
// fishing spot.
//
// There is no structured, cache-loadable representation anywhere of "which
// fish species are reachable with which tool at a given spot" -- that
// reachability rule only exists as branching logic inside each fishing
// spot's own .rs2 script (content/scripts/skill_fishing/scripts/
// fishing_spots/*.rs2). This table is transcribed by hand from those
// scripts, the same convention ItemSourceIndex.ts's transcribed `.dropdata`
// tables already use for a similar "no structured source of truth" gap.
//
// The success_low/success_high VALUES themselves are never duplicated here
// -- computeCatchPercent() below takes them as arguments, read live from
// each fish's own `fishing_struct` param via the compiled cache (see
// FishingSpotSignal.ts), per issue #151's explicit instruction not to
// hardcode a second copy of those numbers.
export interface FishingCatchEntry {
    // the fish item's debugname, e.g. 'raw_shrimp'
    readonly fish: string;
    // the player's Fishing level must be >= this for the species to be
    // reachable at all (separate from the success_low/high roll itself --
    // e.g. saltfish.rs2 never even attempts an anchovies roll below level 15)
    readonly minLevel: number;
}

export const FISHING_SPOT_CATALOG: Readonly<Record<string, Readonly<Record<string, ReadonlyArray<FishingCatchEntry>>>>> = {
    // content/scripts/skill_fishing/scripts/fishing_spots/saltfish.rs2
    saltfish: {
        net: [
            { fish: 'raw_shrimp', minLevel: 1 },
            { fish: 'raw_anchovies', minLevel: 15 }
        ],
        fishing_rod: [
            { fish: 'raw_sardine', minLevel: 5 },
            { fish: 'raw_herring', minLevel: 10 }
        ]
    },
    // content/scripts/skill_fishing/scripts/fishing_spots/freshfish.rs2
    freshfish: {
        fly_fishing_rod: [
            { fish: 'raw_trout', minLevel: 20 },
            { fish: 'raw_salmon', minLevel: 30 }
        ],
        fishing_rod: [{ fish: 'raw_pike', minLevel: 25 }]
    },
    // content/scripts/skill_fishing/scripts/fishing_spots/rarefish.rs2
    rarefish: {
        lobster_pot: [{ fish: 'raw_lobster', minLevel: 40 }],
        harpoon: [
            { fish: 'raw_tuna', minLevel: 35 },
            { fish: 'raw_swordfish', minLevel: 50 }
        ]
    },
    // content/scripts/skill_fishing/scripts/fishing_spots/memberfish.rs2
    memberfish: {
        harpoon: [{ fish: 'raw_shark', minLevel: 76 }]
        // big_net's mackerel/junk table (fish_roll_big_net) is deliberately
        // excluded: those items (mackerel, cod, bass, leather boots, seaweed,
        // casket, ...) roll via hardcoded stat_random(fishing, low, high)
        // literals written directly in the script, not a fish's
        // `fishing_struct` param -- there is no struct-sourced number for
        // them to read without hardcoding a second copy of it.
    },
    // content/scripts/skill_fishing/scripts/fishing_spots/slimeyfish.rs2
    slimeyfish: {
        fishing_rod: [{ fish: 'mort_slimey_eel', minLevel: 28 }]
    },
    // content/scripts/skill_fishing/scripts/fishing_spots/lavafish.rs2
    lavafish: {
        oily_fishing_rod: [{ fish: 'raw_lava_eel', minLevel: 53 }]
    }
};

// The lava eel spot's NPC (fishing.npc) has no `category=` line at all --
// [opnpc1,0_45_152_lavafish] dispatches on its literal debugname, not a
// category (see CONTEXT.md's "underscore vs debugname dispatch" convention).
const LAVAFISH_NPC_DEBUGNAMES: ReadonlySet<string> = new Set(['0_45_152_lavafish']);

// Resolves a "Fishing spot" NPC to its FISHING_SPOT_CATALOG key, or null if
// this spot has no catalog entry (e.g. the Tai Bwo Wannai karambwan/
// karambwanji spots and the Fishing Contest quest spots, both of which also
// roll hardcoded stat_random() literals with no backing struct -- same
// exclusion reasoning as big_net above).
export function resolveFishingSpotKey(categoryDebugname: string | null, npcDebugname: string | null): string | null {
    if (npcDebugname !== null && LAVAFISH_NPC_DEBUGNAMES.has(npcDebugname)) {
        return 'lavafish';
    }

    if (categoryDebugname !== null && Object.prototype.hasOwnProperty.call(FISHING_SPOT_CATALOG, categoryDebugname)) {
        return categoryDebugname;
    }

    return null;
}

// Picks the first tool (in the spot's own declared order) the player
// currently holds, then returns every species reachable with it at their
// current Fishing level. Real gameplay tracks the transiently-used tool via
// last_useitem inside an active fishing interaction, which isn't persistent
// player state outside of a script context -- this first-held-tool the
// player is carrying is the reasonable proxy for "currently equipped tool"
// from outside that interaction. Returns [] if the player holds no tool
// valid for this spot, or if fishingLevel is below every entry's minLevel.
export function getReachableSpecies(spotKey: string, hasTool: (toolDebugname: string) => boolean, fishingLevel: number): FishingCatchEntry[] {
    const toolsForSpot = FISHING_SPOT_CATALOG[spotKey];
    if (!toolsForSpot) {
        return [];
    }

    for (const toolDebugname of Object.keys(toolsForSpot)) {
        if (!hasTool(toolDebugname)) {
            continue;
        }

        return toolsForSpot[toolDebugname].filter(entry => fishingLevel >= entry.minLevel);
    }

    return [];
}

// The exact STAT_RANDOM formula (PlayerOps.ts's [ScriptOpcode.STAT_RANDOM]
// handler: https://x.com/JagexAsh/status/1110604592138670083), expressed as
// the percentage chance of success (value / 256) rather than a single dice
// roll against it -- per issue #151's Autonomy line ("computed percentage,
// not raw formula inputs").
export function computeCatchPercent(low: number, high: number, fishingLevel: number): number {
    const clampedLevel = Math.min(fishingLevel, 99);
    const value = Math.floor((low * (99 - clampedLevel)) / 98) + Math.floor((high * (clampedLevel - 1)) / 98) + 1;
    const clampedValue = Math.max(0, Math.min(value, 256));
    return Math.round((clampedValue / 256) * 100);
}
