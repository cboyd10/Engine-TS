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

type MapLabel = {
    name: string;
    x: number;
    z: number;
    level: number;
};

type ItemIndex = {
    shopsByItem: Map<string, ShopSource[]>;
    spawnsByItem: Map<string, GroundSpawnSource[]>;
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

function loadNpcNames(): Map<number, string> {
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

function loadNpcSpawns(npcNames: Map<number, string>): Map<string, NpcLocation[]> {
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

function loadLabels(): MapLabel[] {
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

function nearestLabel(labels: MapLabel[], x: number, z: number, maxDistance = 48): string | null {
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

function buildIndex(): ItemIndex {
    const objNames = loadObjNames();
    const npcNames = loadNpcNames();
    const labels = loadLabels();
    const shopInfo = loadShopInfo(npcNames);

    return {
        shopsByItem: loadShopSources(shopInfo),
        spawnsByItem: loadGroundSpawns(objNames, labels)
    };
}

export function getItemSourceIndex(forceRebuild = false): ItemIndex {
    if (!cachedIndex || forceRebuild) {
        cachedIndex = buildIndex();
    }

    return cachedIndex;
}

export function searchItemSources(query: string): { shops: ShopSource[]; groundSpawns: GroundSpawnSource[] } {
    const index = getItemSourceIndex();
    const needle = query.trim().toLowerCase().replace(/_/g, ' ');

    if (!needle) {
        return { shops: [], groundSpawns: [] };
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

    const shops: ShopSource[] = [];
    const groundSpawns: GroundSpawnSource[] = [];

    for (const name of matchedNames) {
        shops.push(...(index.shopsByItem.get(name) ?? []));
        groundSpawns.push(...(index.spawnsByItem.get(name) ?? []));
    }

    shops.sort((a, b) => a.item.localeCompare(b.item) || a.shop.localeCompare(b.shop));
    groundSpawns.sort((a, b) => a.item.localeCompare(b.item) || a.x - b.x);

    return { shops, groundSpawns };
}
