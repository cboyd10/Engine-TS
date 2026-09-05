import fs from 'fs';
import path from 'path';

import Environment from '#/util/Environment.js';

export type NpcLocation = {
    x: number;
    z: number;
    level: number;
    mapsquare: string;
};

export type ShopSource = {
    item: string;
    shop: string;
    npcName: string | null;
    area: string;
    quantity: number;
    price: number;
    locations: NpcLocation[];
};

export type GroundSpawnSource = {
    item: string;
    x: number;
    z: number;
    level: number;
    quantity: number;
    mapsquare: string;
    area: string | null;
};

export type NpcDropSource = {
    item: string;
    quantity: number;
    chance: number;
    rate: string;
    source: string;
    triggerKey: string;
    npcDebugnames: string[];
    combatLevel: number | string | null;
    area: string | null;
    locations: NpcLocation[];
};

export type MapLabel = {
    name: string;
    x: number;
    z: number;
    level: number;
};

// One area-grouped row of an NPC's own spawn locations (issue #102's /npc
// page) - the same "one row per (source, area) pair" convention
// buildNpcDropSources() already uses for drop-source rows.
export type NpcSpawnArea = {
    area: string | null;
    locations: NpcLocation[];
};

export type NpcSearchResult = {
    name: string;
    drops: NpcDropSource[];
    spawnAreas: NpcSpawnArea[];
};

type ItemIndex = {
    shopsByItem: Map<string, ShopSource[]>;
    spawnsByItem: Map<string, GroundSpawnSource[]>;
    dropsByItem: Map<string, NpcDropSource[]>;
    dropsByNpc: Map<string, NpcDropSource[]>;
    // every real .npc display name in the game (issue #102's /npc search
    // universe), not just drop- or spawn-covered ones
    npcDisplayNames: string[];
    // an NPC display name's own spawn locations, pooled across every
    // debugname sharing that name and grouped by nearest map label - the
    // same partitioning buildNpcDropSources() applies to drop sources
    npcSpawnAreasByName: Map<string, NpcSpawnArea[]>;
};

let cachedIndex: ItemIndex | null = null;

function contentRoot(): string {
    return path.resolve(Environment.build.srcDir);
}

function walkFiles(dir: string, extension: string, out: string[]): void {
    if (!fs.existsSync(dir)) {
        return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === '_unpack') {
                continue;
            }
            walkFiles(full, extension, out);
        } else if (entry.name.endsWith(extension)) {
            out.push(full);
        }
    }
}

// Unlike walkFiles(), this does NOT skip `_unpack/<revision>/` dumps. Those
// directories are genuinely compiled into the live pack (PackFile.ts's
// `_unpack` check only suppresses a folder-naming lint; FsCache.ts's
// listDir() walks it like any other directory), and several pilot NPC
// categories (citizen/bear/guard/cow/chicken) are only fully populated
// there - see content/scripts/drop tables/webdata/README.md. Only used for
// category/debugname resolution, which needs that full picture; the
// existing shop/ground-spawn loaders below intentionally keep skipping
// `_unpack` for their own noise-reduction reasons and are unchanged.
function walkAllFiles(dir: string, extension: string, out: string[]): void {
    if (!fs.existsSync(dir)) {
        return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walkAllFiles(full, extension, out);
        } else if (entry.name.endsWith(extension)) {
            out.push(full);
        }
    }
}

function prettify(name: string): string {
    return name
        .replace(/^area_/, '')
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^./, c => c.toUpperCase());
}

function loadObjNames(): Map<number, string> {
    const names = new Map<number, string>();
    const packPath = path.join(contentRoot(), 'pack', 'obj.pack');

    if (!fs.existsSync(packPath)) {
        return names;
    }

    const lines = fs.readFileSync(packPath, 'ascii').split(/\r?\n/);
    for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq === -1) {
            continue;
        }

        const id = parseInt(line.slice(0, eq), 10);
        const name = line.slice(eq + 1).trim();
        if (!Number.isNaN(id) && name) {
            names.set(id, name);
        }
    }

    return names;
}

export function loadNpcNames(): Map<number, string> {
    const names = new Map<number, string>();
    const packPath = path.join(contentRoot(), 'pack', 'npc.pack');

    if (!fs.existsSync(packPath)) {
        return names;
    }

    const lines = fs.readFileSync(packPath, 'ascii').split(/\r?\n/);
    for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq === -1) {
            continue;
        }

        const id = parseInt(line.slice(0, eq), 10);
        const name = line.slice(eq + 1).trim();
        if (!Number.isNaN(id) && name) {
            names.set(id, name);
        }
    }

    return names;
}

type ShopOwner = {
    npcDebugname: string;
    npcName: string;
    shopTitle: string | null;
};

// maps a shop's bracket id (e.g. "cookeryshop") to the npcs that run it, via each
// npc config's `name=`, `param=owned_shop,<shopid>` and `param=shop_title,<title>` lines
function loadShopOwners(): Map<string, ShopOwner[]> {
    const result = new Map<string, ShopOwner[]>();
    const files: string[] = [];
    walkFiles(path.join(contentRoot(), 'scripts'), '.npc', files);

    for (const file of files) {
        const lines = fs.readFileSync(file, 'ascii').split(/\r?\n/);
        let currentNpc: string | null = null;
        let npcName: string | null = null;
        let ownedShop: string | null = null;
        let shopTitle: string | null = null;

        const commit = () => {
            if (currentNpc && ownedShop) {
                const owners = result.get(ownedShop) ?? [];
                owners.push({
                    npcDebugname: currentNpc,
                    npcName: npcName ?? prettify(currentNpc),
                    shopTitle: shopTitle ? shopTitle.replace(/\.$/, '').trim() : null
                });
                result.set(ownedShop, owners);
            }
        };

        for (const raw of lines) {
            const line = raw.trim();
            const sectionMatch = line.match(/^\[([a-zA-Z0-9_]+)\]$/);
            if (sectionMatch) {
                commit();
                currentNpc = sectionMatch[1];
                npcName = null;
                ownedShop = null;
                shopTitle = null;
                continue;
            }

            if (!currentNpc) {
                continue;
            }

            if (line.startsWith('name=')) {
                npcName = line.slice('name='.length).trim();
                continue;
            }

            const ownerMatch = line.match(/^param=owned_shop,(\S+)$/);
            if (ownerMatch) {
                ownedShop = ownerMatch[1];
                continue;
            }

            const titleMatch = line.match(/^param=shop_title,(.+)$/);
            if (titleMatch) {
                shopTitle = titleMatch[1];
            }
        }

        commit();
    }

    return result;
}

export function loadNpcSpawns(npcNames: Map<number, string>): Map<string, NpcLocation[]> {
    const result = new Map<string, NpcLocation[]>();
    const files: string[] = [];
    walkFiles(path.join(contentRoot(), 'maps'), '.jm2', files);

    for (const file of files) {
        const base = path.basename(file, '.jm2');
        const match = base.match(/^m(\d+)_(\d+)$/);
        if (!match) {
            continue;
        }

        const mapsquareX = parseInt(match[1], 10);
        const mapsquareZ = parseInt(match[2], 10);

        const lines = fs.readFileSync(file, 'ascii').split(/\r?\n/);
        const npcStart = lines.indexOf('==== NPC ====');
        if (npcStart === -1) {
            continue;
        }

        for (let i = npcStart + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }

            const npcMatch = line.match(/^(\d+)\s+(\d+)\s+(\d+):\s+(\d+)$/);
            if (!npcMatch) {
                break;
            }

            const level = parseInt(npcMatch[1], 10);
            const localX = parseInt(npcMatch[2], 10);
            const localZ = parseInt(npcMatch[3], 10);
            const id = parseInt(npcMatch[4], 10);

            const npcName = npcNames.get(id);
            if (!npcName) {
                continue;
            }

            const location: NpcLocation = {
                x: mapsquareX * 64 + localX,
                z: mapsquareZ * 64 + localZ,
                level,
                mapsquare: `${mapsquareX}_${mapsquareZ}`
            };

            const list = result.get(npcName) ?? [];
            list.push(location);
            result.set(npcName, list);
        }
    }

    return result;
}

type ShopInfo = {
    npcName: string | null;
    shopTitle: string | null;
    locations: NpcLocation[];
};

// combines owned_shop ownership with npc spawn locations into shopId -> display info
function loadShopInfo(npcNames: Map<number, string>): Map<string, ShopInfo> {
    const owners = loadShopOwners();
    const npcSpawns = loadNpcSpawns(npcNames);
    const result = new Map<string, ShopInfo>();

    for (const [shopId, ownerList] of owners) {
        const locations: NpcLocation[] = [];
        for (const owner of ownerList) {
            locations.push(...(npcSpawns.get(owner.npcDebugname) ?? []));
        }

        // usually one npc per shop - if a shop is quest-reused by more than one,
        // prefer whichever entry has a shop_title for display purposes
        const primary = ownerList.find(o => o.shopTitle) ?? ownerList[0];

        result.set(shopId, {
            npcName: primary?.npcName ?? null,
            shopTitle: primary?.shopTitle ?? null,
            locations
        });
    }

    return result;
}

export function loadLabels(): MapLabel[] {
    const labels: MapLabel[] = [];
    const labelsPath = path.join(contentRoot(), 'maps', 'labels.txt');

    if (!fs.existsSync(labelsPath)) {
        return labels;
    }

    const lines = fs.readFileSync(labelsPath, 'ascii').split(/\r?\n/);
    for (const line of lines) {
        if (!line.startsWith('=')) {
            continue;
        }

        const [name, x, z, level] = line.slice(1).split(',');
        const xi = parseInt(x, 10);
        const zi = parseInt(z, 10);
        const li = parseInt(level, 10);

        if (name && !Number.isNaN(xi) && !Number.isNaN(zi)) {
            labels.push({ name, x: xi, z: zi, level: Number.isNaN(li) ? 0 : li });
        }
    }

    return labels;
}

export function nearestLabel(labels: MapLabel[], x: number, z: number, maxDistance = 48): string | null {
    // labels are named waypoints on the overhead map, not plane-specific,
    // so match on x/z distance only - a ground-floor spawn under an upper-floor
    // labelled building (e.g. Draynor Manor) should still resolve to that label
    let bestName: string | null = null;
    let bestDist = maxDistance;

    for (const label of labels) {
        const dist = Math.hypot(label.x - x, label.z - z);
        if (dist <= bestDist) {
            bestDist = dist;
            bestName = label.name;
        }
    }

    return bestName;
}

function loadShopSources(shopInfo: Map<string, ShopInfo>): Map<string, ShopSource[]> {
    const result = new Map<string, ShopSource[]>();
    const files: string[] = [];
    walkFiles(path.join(contentRoot(), 'scripts'), '.inv', files);

    for (const file of files) {
        const lines = fs.readFileSync(file, 'ascii').split(/\r?\n/);
        const area = prettify(path.basename(path.dirname(path.dirname(file))));
        let currentShop: string | null = null;

        for (const raw of lines) {
            const line = raw.trim();
            const sectionMatch = line.match(/^\[([a-zA-Z0-9_]+)\]$/);
            if (sectionMatch) {
                currentShop = sectionMatch[1];
                continue;
            }

            if (!currentShop || !line.startsWith('stock')) {
                continue;
            }

            const eq = line.indexOf('=');
            if (eq === -1) {
                continue;
            }

            const parts = line
                .slice(eq + 1)
                .split(',')
                .map(p => p.trim());

            // entries without a price aren't purchasable stock - e.g. skill_guide.inv reuses
            // the same stockN= format to list example items, not real shop inventory
            if (parts.length < 3) {
                continue;
            }

            const itemName = parts[0];
            const quantity = parseInt(parts[1], 10);
            const price = parseInt(parts[2], 10);

            if (!itemName || Number.isNaN(quantity) || quantity <= 0 || Number.isNaN(price)) {
                continue;
            }

            const info = shopInfo.get(currentShop);

            const source: ShopSource = {
                item: prettify(itemName),
                shop: info?.shopTitle ?? prettify(currentShop),
                npcName: info?.npcName ?? null,
                area,
                quantity,
                price,
                locations: info?.locations ?? []
            };

            const list = result.get(itemName) ?? [];
            list.push(source);
            result.set(itemName, list);
        }
    }

    return result;
}

function loadGroundSpawns(objNames: Map<number, string>, labels: MapLabel[]): Map<string, GroundSpawnSource[]> {
    const result = new Map<string, GroundSpawnSource[]>();
    const files: string[] = [];
    walkFiles(path.join(contentRoot(), 'maps'), '.jm2', files);

    for (const file of files) {
        const base = path.basename(file, '.jm2');
        const match = base.match(/^m(\d+)_(\d+)$/);
        if (!match) {
            continue;
        }

        const mapsquareX = parseInt(match[1], 10);
        const mapsquareZ = parseInt(match[2], 10);

        const lines = fs.readFileSync(file, 'ascii').split(/\r?\n/);
        const objStart = lines.indexOf('==== OBJ ====');
        if (objStart === -1) {
            continue;
        }

        for (let i = objStart + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }

            const objMatch = line.match(/^(\d+)\s+(\d+)\s+(\d+):\s+(\d+)\s+(\d+)$/);
            if (!objMatch) {
                continue;
            }

            const level = parseInt(objMatch[1], 10);
            const localX = parseInt(objMatch[2], 10);
            const localZ = parseInt(objMatch[3], 10);
            const id = parseInt(objMatch[4], 10);
            const quantity = parseInt(objMatch[5], 10);

            const itemName = objNames.get(id);
            if (!itemName) {
                continue;
            }

            const absX = mapsquareX * 64 + localX;
            const absZ = mapsquareZ * 64 + localZ;

            const source: GroundSpawnSource = {
                item: prettify(itemName),
                x: absX,
                z: absZ,
                level,
                quantity,
                mapsquare: `${mapsquareX}_${mapsquareZ}`,
                area: nearestLabel(labels, absX, absZ)
            };

            const list = result.get(itemName) ?? [];
            list.push(source);
            result.set(itemName, list);
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// NPC drop sources (issue #57)
//
// content/scripts/drop tables/webdata/*.dropdata files are a hand-transcribed,
// display-only mirror of the live [ai_queue3,<trigger>] drop-table scripts
// (content/scripts/drop tables/scripts/*.rs2). They reuse drop_table.dbtable's
// column layout for convention consistency but are parsed here with a new
// lightweight regex parser - no DbTableType/DbRowType, no cache/pack
// dependency, matching this file's existing loaders' style. See
// content/scripts/drop tables/webdata/README.md for the format and the
// branches excluded from every table (Ring of Wealth, Legends' Quest, clue
// tertiary rolls).
// ---------------------------------------------------------------------------

type DropTableRow = { kind: 'drop'; item: string; quantity: number; weight: number } | { kind: 'subtable'; table: string; weight: number } | { kind: 'guaranteed'; item: string; quantity: number };

type DropTable = {
    name: string;
    total: number;
    rows: DropTableRow[];
};

export type DropTables = {
    tables: Map<string, DropTable>;
    // trigger key (e.g. "_citizen", "firegiant") -> table name
    triggers: Map<string, string>;
};

export function loadDropTables(): DropTables {
    const tables = new Map<string, DropTable>();
    const triggers = new Map<string, string>();
    const dir = path.join(contentRoot(), 'scripts', 'drop tables', 'webdata');
    const files: string[] = [];
    walkFiles(dir, '.dropdata', files);

    for (const file of files) {
        const isTriggerManifest = path.basename(file) === 'triggers.dropdata';
        const lines = fs.readFileSync(file, 'ascii').split(/\r?\n/);

        let currentName: string | null = null;
        let total = 0;
        let rows: DropTableRow[] = [];
        let triggerTable: string | null = null;

        const commit = () => {
            if (!currentName) {
                return;
            }

            if (isTriggerManifest) {
                if (triggerTable) {
                    triggers.set(currentName, triggerTable);
                }
            } else {
                tables.set(currentName, { name: currentName, total, rows });
            }
        };

        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('//')) {
                continue;
            }

            const sectionMatch = line.match(/^\[([a-zA-Z0-9_]+)\]$/);
            if (sectionMatch) {
                commit();
                currentName = sectionMatch[1];
                total = 0;
                rows = [];
                triggerTable = null;
                continue;
            }

            if (!currentName) {
                continue;
            }

            if (isTriggerManifest) {
                const tableMatch = line.match(/^table=(\S+)$/);
                if (tableMatch) {
                    triggerTable = tableMatch[1];
                }
                continue;
            }

            const totalMatch = line.match(/^data=total,(\d+)$/);
            if (totalMatch) {
                total = parseInt(totalMatch[1], 10);
                continue;
            }

            const dropMatch = line.match(/^data=drop,([a-zA-Z0-9_]+),(\d+),(\d+)$/);
            if (dropMatch) {
                rows.push({ kind: 'drop', item: dropMatch[1], quantity: parseInt(dropMatch[2], 10), weight: parseInt(dropMatch[3], 10) });
                continue;
            }

            const subtableMatch = line.match(/^data=subtable,([a-zA-Z0-9_]+),(\d+)$/);
            if (subtableMatch) {
                rows.push({ kind: 'subtable', table: subtableMatch[1], weight: parseInt(subtableMatch[2], 10) });
                continue;
            }

            const guaranteedMatch = line.match(/^data=guaranteed,([a-zA-Z0-9_]+),(\d+)$/);
            if (guaranteedMatch) {
                rows.push({ kind: 'guaranteed', item: guaranteedMatch[1], quantity: parseInt(guaranteedMatch[2], 10) });
            }
        }

        commit();
    }

    return { tables, triggers };
}

type FlatDrop = {
    item: string;
    quantity: number;
    numerator: bigint;
    denominator: bigint;
};

// Recursively composes subtable references into a flat list of (item, exact
// fraction-of-a-kill) pairs, memoizing each table's result so a shared
// subtable (~randomherb etc.) is only computed once no matter how many
// pilot NPCs reference it.
function flattenTable(tables: Map<string, DropTable>, name: string, memo: Map<string, FlatDrop[]>): FlatDrop[] {
    const cached = memo.get(name);
    if (cached) {
        return cached;
    }

    const table = tables.get(name);
    if (!table || table.total <= 0) {
        memo.set(name, []);
        return [];
    }

    const result: FlatDrop[] = [];
    const totalBig = BigInt(table.total);

    for (const row of table.rows) {
        if (row.kind === 'drop') {
            result.push({ item: row.item, quantity: row.quantity, numerator: BigInt(row.weight), denominator: totalBig });
        } else if (row.kind === 'subtable') {
            const nested = flattenTable(tables, row.table, memo);
            for (const drop of nested) {
                result.push({
                    item: drop.item,
                    quantity: drop.quantity,
                    numerator: drop.numerator * BigInt(row.weight),
                    denominator: drop.denominator * totalBig
                });
            }
        }
    }

    memo.set(name, result);
    return result;
}

function gcdBig(a: bigint, b: bigint): bigint {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;

    while (b) {
        [a, b] = [b, a % b];
    }

    return a === 0n ? 1n : a;
}

export type NpcConfig = {
    debugname: string;
    name: string | null;
    category: string | null;
    // true if any opN=Attack line appears in this debugname's section (any op
    // slot - e.g. op2=Attack for a hostile NPC, op5=Attack for a right-click-only
    // one). Case-sensitive exact "Attack" match, matching issue #79's scoping
    // scan (614 debugnames) - a handful of quest NPCs (e.g. Monkey Madness'
    // toms_zombie_monkey*) use a lowercase "op1=attack" and are excluded by
    // this, same as that scan.
    attackable: boolean;
    // The NPC's real combat level, read from `vislevel=` - already trusted
    // elsewhere in the engine (the client tooltip's "(level-N)" text, and
    // Npc.ts's hunt-aggression check). `null` covers both a missing line and
    // the non-combat `vislevel=hide` sentinel.
    vislevel: number | null;
};

// See walkAllFiles()'s comment: intentionally includes `_unpack/` dumps.
export function loadAllNpcConfigs(): Map<string, NpcConfig> {
    const result = new Map<string, NpcConfig>();
    const files: string[] = [];
    walkAllFiles(path.join(contentRoot(), 'scripts'), '.npc', files);

    for (const file of files) {
        const lines = fs.readFileSync(file, 'ascii').split(/\r?\n/);
        let currentDebugname: string | null = null;
        let name: string | null = null;
        let category: string | null = null;
        let attackable = false;
        let vislevel: number | null = null;

        const commit = () => {
            if (currentDebugname && !result.has(currentDebugname)) {
                result.set(currentDebugname, { debugname: currentDebugname, name, category, attackable, vislevel });
            }
        };

        for (const raw of lines) {
            const line = raw.trim();
            const sectionMatch = line.match(/^\[([a-zA-Z0-9_]+)\]$/);
            if (sectionMatch) {
                commit();
                currentDebugname = sectionMatch[1];
                name = null;
                category = null;
                attackable = false;
                vislevel = null;
                continue;
            }

            if (!currentDebugname) {
                continue;
            }

            if (line.startsWith('name=')) {
                name = line.slice('name='.length).trim();
                continue;
            }

            if (line.startsWith('category=')) {
                category = line.slice('category='.length).trim();
                continue;
            }

            if (/^op\d+=Attack$/.test(line)) {
                attackable = true;
                continue;
            }

            if (line.startsWith('vislevel=')) {
                const rawVislevel = line.slice('vislevel='.length).trim();
                // Non-combat NPCs use `vislevel=hide` instead of a number -
                // treat that (and anything else non-numeric) as "no combat
                // level" rather than crashing.
                const parsed = Number(rawVislevel);
                vislevel = rawVislevel !== '' && Number.isFinite(parsed) ? parsed : null;
            }
        }

        commit();
    }

    return result;
}

// A single number when every debugname in `debugnames` shares the same real
// combat level (`vislevel`), a "min-max" range string when they differ, or
// null when none of them have a known combat level (non-attackable, or
// vislevel=hide - shouldn't occur for NPCs that reach this table, but this
// must not crash if it does).
function computeCombatLevel(debugnames: string[], npcConfigs: Map<string, NpcConfig>): number | string | null {
    const levels = debugnames.map(debugname => npcConfigs.get(debugname)?.vislevel).filter((level): level is number => level !== null && level !== undefined);

    if (levels.length === 0) {
        return null;
    }

    const min = Math.min(...levels);
    const max = Math.max(...levels);
    return min === max ? min : `${min}-${max}`;
}

type ResolvedTriggerSource = {
    label: string;
    debugnames: string[];
};

// Category-trigger resolution per CONTEXT.md's "NPC AI/drop table dispatch":
// an underscore-prefixed trigger key is category-based - strip the
// underscore and collect every debugname whose .npc `category=` line
// matches that name. A non-underscore key is the debugname itself.
//
// CONTEXT.md's mechanism additionally describes looking the stripped name up
// in content/pack/category.pack to get its category id before the grep. That
// id is unused by the grep itself (.npc `category=` lines already store the
// plain name, not the id) and category.pack is a *generated*, gitignored
// pack file - unlike npc.pack/obj.pack, which this file's other loaders
// already depend on, it does not exist in a fresh checkout until `npm run
// build` has produced it once. Skipping that lookup keeps this parser
// dependency-free (matching the "no cache/pack dependency" requirement) and
// costs no real validation: an unknown/misspelled category name simply
// collects zero debugnames below and is treated as unresolved.
export function resolveTriggerKey(triggerKey: string, npcConfigs: Map<string, NpcConfig>): ResolvedTriggerSource | null {
    if (triggerKey.startsWith('_')) {
        const categoryName = triggerKey.slice(1);

        const debugnames: string[] = [];
        for (const config of npcConfigs.values()) {
            if (config.category === categoryName) {
                debugnames.push(config.debugname);
            }
        }

        if (debugnames.length === 0) {
            return null;
        }

        return { label: prettify(categoryName), debugnames };
    }

    const config = npcConfigs.get(triggerKey);
    if (!config) {
        return null;
    }

    return { label: config.name ?? prettify(triggerKey), debugnames: [triggerKey] };
}

function buildNpcDropSources(npcSpawns: Map<string, NpcLocation[]>, labels: MapLabel[], npcConfigs: Map<string, NpcConfig>): { dropsByItem: Map<string, NpcDropSource[]>; dropsByNpc: Map<string, NpcDropSource[]> } {
    const dropsByItem = new Map<string, NpcDropSource[]>();
    const dropsByNpc = new Map<string, NpcDropSource[]>();

    const { tables, triggers } = loadDropTables();
    const flattenMemo = new Map<string, FlatDrop[]>();

    for (const [triggerKey, tableName] of triggers) {
        const resolved = resolveTriggerKey(triggerKey, npcConfigs);
        if (!resolved) {
            continue;
        }

        const table = tables.get(tableName);
        if (!table) {
            continue;
        }

        // Partition the trigger's debugnames by each one's real in-game
        // `.npc` name= display name, so a category trigger like _citizen
        // (man/man2/man3/al_kharid_man -> "Man", woman/woman2/woman3 ->
        // "Woman") produces one NpcDropSource group per display name
        // instead of one group pooled under the trigger's synthetic
        // category label ("Citizens"). A direct (non-category) trigger's
        // single debugname still forms its own one-member partition, keyed
        // by that debugname's own name - unaffected in shape. Two distinct
        // triggers whose debugnames happen to share a display name (e.g.
        // bearded_dark_wizard/young_dark_wizard, both "Dark wizard") each
        // still add their own partition below, appending to the same
        // dropsByNpc key - every row still carries its own npcDebugnames so
        // a consumer (the /npc page) can split them back into subsections.
        const partitions = new Map<string, string[]>();
        for (const debugname of resolved.debugnames) {
            const displayName = npcConfigs.get(debugname)?.name ?? prettify(debugname);
            const members = partitions.get(displayName) ?? [];
            members.push(debugname);
            partitions.set(displayName, members);
        }

        for (const [displayName, debugnames] of partitions) {
            // pool spawn locations across every member debugname of this
            // partition, then group by nearest map label - one row per
            // (source, area) pair, not one row per debugname or per raw
            // coordinate
            const pooledLocations: NpcLocation[] = [];
            for (const debugname of debugnames) {
                pooledLocations.push(...(npcSpawns.get(debugname) ?? []));
            }

            const byArea = new Map<string | null, NpcLocation[]>();
            for (const location of pooledLocations) {
                const area = nearestLabel(labels, location.x, location.z);
                const list = byArea.get(area) ?? [];
                list.push(location);
                byArea.set(area, list);
            }

            if (byArea.size === 0) {
                byArea.set(null, []);
            }

            const combatLevel = computeCombatLevel(debugnames, npcConfigs);

            const emit = (item: string, quantity: number, numerator: bigint, denominator: bigint, guaranteed: boolean) => {
                const reducedGcd = guaranteed ? 1n : gcdBig(numerator, denominator);
                const reducedNumerator = guaranteed ? 1n : numerator / reducedGcd;
                const reducedDenominator = guaranteed ? 1n : denominator / reducedGcd;
                const chance = guaranteed ? 1 : Number(numerator) / Number(denominator);
                const rate = guaranteed ? 'Always' : `${reducedNumerator}/${reducedDenominator}`;

                for (const [area, locations] of byArea) {
                    const source: NpcDropSource = {
                        item: prettify(item),
                        quantity,
                        chance,
                        rate,
                        source: displayName,
                        triggerKey,
                        npcDebugnames: debugnames,
                        combatLevel,
                        area,
                        locations
                    };

                    const byItemList = dropsByItem.get(item) ?? [];
                    byItemList.push(source);
                    dropsByItem.set(item, byItemList);

                    const byNpcList = dropsByNpc.get(displayName) ?? [];
                    byNpcList.push(source);
                    dropsByNpc.set(displayName, byNpcList);
                }
            };

            for (const row of table.rows) {
                if (row.kind === 'guaranteed') {
                    emit(row.item, row.quantity, 1n, 1n, true);
                }
            }

            for (const drop of flattenTable(tables, tableName, flattenMemo)) {
                emit(drop.item, drop.quantity, drop.numerator, drop.denominator, false);
            }
        }
    }

    for (const list of dropsByItem.values()) {
        list.sort((a, b) => b.chance - a.chance);
    }
    for (const list of dropsByNpc.values()) {
        list.sort((a, b) => b.chance - a.chance);
    }

    return { dropsByItem, dropsByNpc };
}

// Pools npcSpawns' raw per-debugname locations by each debugname's real
// in-game display name (same partitioning buildNpcDropSources() applies to
// drop sources), then groups each name's pooled locations by nearest map
// label - one row per (name, area) pair, matching the drop-source
// convention. Used by the /npc page (issue #102) to show an NPC's own
// spawn locations under its display name, independent of drop coverage.
function buildNpcSpawnAreasByName(npcSpawns: Map<string, NpcLocation[]>, npcConfigs: Map<string, NpcConfig>, labels: MapLabel[]): Map<string, NpcSpawnArea[]> {
    const pooledByName = new Map<string, NpcLocation[]>();
    for (const [debugname, locations] of npcSpawns) {
        const displayName = npcConfigs.get(debugname)?.name ?? prettify(debugname);
        const list = pooledByName.get(displayName) ?? [];
        list.push(...locations);
        pooledByName.set(displayName, list);
    }

    const result = new Map<string, NpcSpawnArea[]>();
    for (const [displayName, locations] of pooledByName) {
        const byArea = new Map<string | null, NpcLocation[]>();
        for (const location of locations) {
            const area = nearestLabel(labels, location.x, location.z);
            const list = byArea.get(area) ?? [];
            list.push(location);
            byArea.set(area, list);
        }

        result.set(
            displayName,
            [...byArea.entries()].map(([area, areaLocations]) => ({ area, locations: areaLocations }))
        );
    }

    return result;
}

function buildIndex(): ItemIndex {
    const objNames = loadObjNames();
    const npcNames = loadNpcNames();
    const labels = loadLabels();
    const shopInfo = loadShopInfo(npcNames);
    const npcSpawns = loadNpcSpawns(npcNames);
    const npcConfigs = loadAllNpcConfigs();
    const { dropsByItem, dropsByNpc } = buildNpcDropSources(npcSpawns, labels, npcConfigs);

    const npcDisplayNames = [...new Set([...npcConfigs.values()].map(config => config.name ?? prettify(config.debugname)))];

    return {
        shopsByItem: loadShopSources(shopInfo),
        spawnsByItem: loadGroundSpawns(objNames, labels),
        dropsByItem,
        dropsByNpc,
        npcDisplayNames,
        npcSpawnAreasByName: buildNpcSpawnAreasByName(npcSpawns, npcConfigs, labels)
    };
}

export function getItemSourceIndex(forceRebuild = false): ItemIndex {
    if (!cachedIndex || forceRebuild) {
        cachedIndex = buildIndex();
    }

    return cachedIndex;
}

export function searchItemSources(query: string): { shops: ShopSource[]; groundSpawns: GroundSpawnSource[]; drops: NpcDropSource[] } {
    const index = getItemSourceIndex();
    const needle = query.trim().toLowerCase().replace(/_/g, ' ');

    if (!needle) {
        return { shops: [], groundSpawns: [], drops: [] };
    }

    const matchedNames = new Set<string>();
    for (const name of index.shopsByItem.keys()) {
        if (name.toLowerCase().replace(/_/g, ' ').includes(needle)) {
            matchedNames.add(name);
        }
    }
    for (const name of index.spawnsByItem.keys()) {
        if (name.toLowerCase().replace(/_/g, ' ').includes(needle)) {
            matchedNames.add(name);
        }
    }
    for (const name of index.dropsByItem.keys()) {
        if (name.toLowerCase().replace(/_/g, ' ').includes(needle)) {
            matchedNames.add(name);
        }
    }

    const shops: ShopSource[] = [];
    const groundSpawns: GroundSpawnSource[] = [];
    const drops: NpcDropSource[] = [];

    for (const name of matchedNames) {
        shops.push(...(index.shopsByItem.get(name) ?? []));
        groundSpawns.push(...(index.spawnsByItem.get(name) ?? []));
        drops.push(...(index.dropsByItem.get(name) ?? []));
    }

    // sorted alphabetically by resolved area name first (issue #54), so results read
    // grouped by location rather than by discovery/shop order; item/shop/NPC name and
    // stock/price remain as tiebreakers for a stable, fully-determined order (issue #67)
    shops.sort((a, b) => {
        // unresolved NPCs (rendered as "Unknown") sort last, same convention as area below
        const npcA = a.npcName ?? '￿';
        const npcB = b.npcName ?? '￿';
        return a.area.localeCompare(b.area) || a.item.localeCompare(b.item) || a.shop.localeCompare(b.shop) || npcA.localeCompare(npcB) || a.quantity - b.quantity || a.price - b.price;
    });
    groundSpawns.sort((a, b) => {
        // unresolved areas (no nearby map label, rendered as "Unknown area") sort last
        const areaA = a.area ?? '￿';
        const areaB = b.area ?? '￿';
        return areaA.localeCompare(areaB) || a.item.localeCompare(b.item) || a.x - b.x || a.z - b.z || a.level - b.level || a.quantity - b.quantity;
    });
    // highest-chance drop first (guaranteed drops sort to the top), then alphabetically
    // by source/area for a stable order among ties
    drops.sort((a, b) => {
        const areaA = a.area ?? '￿';
        const areaB = b.area ?? '￿';
        return b.chance - a.chance || a.source.localeCompare(b.source) || areaA.localeCompare(areaB) || a.item.localeCompare(b.item);
    });

    return { shops, groundSpawns, drops };
}

// Collapses multiple same-value combatLevels down to one (e.g. three of
// "Goblin"'s five variants all report vislevel 5 - that should read as one
// "5", not "5, 5, 5"), then formats the result: a single surviving value
// keeps its original type/shape (a plain number, or an existing "min-max"
// range string from computeCombatLevel()), while more than one distinct
// value becomes a numerically-sorted, comma-joined string (e.g. "2, 5, 13")
// so a Drops row shared across combat-level variants shows all of them.
function combineCombatLevels(levels: (number | string | null)[]): number | string | null {
    const distinct = new Map<string, number | string | null>();
    for (const level of levels) {
        distinct.set(level === null ? '' : String(level), level);
    }

    const values = [...distinct.values()];
    if (values.length <= 1) {
        return values[0] ?? null;
    }

    return values
        .slice()
        .sort((a, b) => {
            const na = parseInt(String(a), 10);
            const nb = parseInt(String(b), 10);
            return Number.isNaN(na) || Number.isNaN(nb) ? String(a).localeCompare(String(b)) : na - nb;
        })
        .map(v => v ?? '?')
        .join(', ');
}

// Collapses buildNpcDropSources()'s one-row-per-(item, quantity/weight-row,
// area) rows (the /items-facing convention, left untouched) - and, for a
// display name resolving to more than one structurally distinct drop table
// (e.g. "Goblin" covering five separate combat-level variants: goblin/
// goblin_armed/goblin_helmet/goblin_greenarmour/goblin_redarmour), one row
// per variant too - into a single /npc-facing Drops row per (item, rate)
// (issue #154, second grilling round). A drop shared across several areas
// and/or combat-level variants is one NPC-facing fact, not several
// duplicate or "Variant N" rows; its Combat Level column instead lists
// every distinct level that has it (see combineCombatLevels() above).
// Quantity is taken from the first row seen for a given (item, rate) pair -
// stable in practice, since a shared rate implies a shared weight/table
// shape. Locations are pooled across every merged row so "Show on Map"
// still has something to center on; area is no longer meaningful per-row
// so it's cleared. Sorted by item name, per issue #154.
function mergeNpcDrops(rows: NpcDropSource[]): NpcDropSource[] {
    const merged = new Map<string, NpcDropSource>();
    const combatLevelsByKey = new Map<string, (number | string | null)[]>();

    for (const row of rows) {
        const key = `${row.item} ${row.rate}`;
        const existing = merged.get(key);
        if (existing) {
            existing.locations.push(...row.locations);
            combatLevelsByKey.get(key)!.push(row.combatLevel);
        } else {
            merged.set(key, { ...row, area: null, locations: [...row.locations] });
            combatLevelsByKey.set(key, [row.combatLevel]);
        }
    }

    const result = [...merged.entries()].map(([key, row]) => {
        row.combatLevel = combineCombatLevels(combatLevelsByKey.get(key)!);
        return row;
    });

    result.sort((a, b) => a.item.localeCompare(b.item));
    return result;
}

// Parallel to searchItemSources() (issue #102), but matched against the
// full NPC display-name universe (every real .npc name=, from
// npcDisplayNames) rather than just drop-/spawn-covered names - so a
// non-combat, non-drop NPC still shows up with both sections empty.
export function searchNpcSources(query: string): NpcSearchResult[] {
    const index = getItemSourceIndex();
    const needle = query.trim().toLowerCase().replace(/_/g, ' ');

    if (!needle) {
        return [];
    }

    const matchedNames = new Set<string>();
    for (const name of index.npcDisplayNames) {
        if (name.toLowerCase().replace(/_/g, ' ').includes(needle)) {
            matchedNames.add(name);
        }
    }

    const results: NpcSearchResult[] = [];
    for (const name of matchedNames) {
        const drops = index.dropsByNpc.get(name) ?? [];

        results.push({
            name,
            drops: mergeNpcDrops(drops),
            spawnAreas: index.npcSpawnAreasByName.get(name) ?? []
        });
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
}
