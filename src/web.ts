import fs from 'fs';
import path from 'path';

import ejs from 'ejs';
import Fastify from 'fastify';
import FastifyStatic from '@fastify/static';
import FastifyView from '@fastify/view';
import FastifyWebsocket from '@fastify/websocket';
import { register } from 'prom-client';

import { CrcBuffer, CrcTable } from '#/cache/CrcTable.js';

import { CommandTierLabel, commandDocs } from '#/data/commandDocs.js';

import { db, toIsoTimestamp } from '#/db/query.js';

import { PlayerStatEnabled, PlayerStatNameMap } from '#/engine/entity/PlayerStat.js';
import OnDemand from '#/engine/OnDemand.js';
import World from '#/engine/World.js';

import NullClientSocket from '#/server/NullClientSocket.js';

import { LoggerEventType } from '#/server/logger/LoggerEventType.js';

import WSClientSocket from '#/server/ws/WSClientSocket.js';

import Environment from '#/util/Environment.js';
import { searchItemSources, searchNpcSources } from '#/util/ItemSourceIndex.js';
import { tryParseInt, tryParseString } from '#/util/TryParse.js';
import { createDefaultWorldConfig, loadWorldConfig, normalizeWorldConfig, saveWorldConfig } from '#/util/WorldConfig.js';

function resolveContentPath(name: string): string | null {
    let decodedName: string;
    try {
        decodedName = decodeURIComponent(name);
    } catch {
        return null;
    }

    const contentRoot = path.resolve(Environment.build.srcDir);
    const targetPath = path.resolve(contentRoot, decodedName);
    const relativePath = path.relative(contentRoot, targetPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return null;
    }

    return targetPath;
}

function fileExists(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

const fastify = Fastify({
    // logger: true
});

fastify.register(FastifyView, {
    engine: {
        ejs
    },
    root: 'view'
});

await fastify.register(FastifyWebsocket, {
    options: {
        maxPayload: 1600,
        perMessageDeflate: false,
        verifyClient: function (info, next) {
            if (Environment.web.allowedOrigin && info.req.headers.origin !== Environment.web.allowedOrigin) {
                next(false);
                return;
            }

            next(true);
        }
    }
});

// general routes

fastify.route({
    method: 'GET',
    url: '/',
    handler: (_req, reply) => {
        return reply.viewAsync('home.ejs', {});
    },
    wsHandler: (socket, req) => {
        const client = new WSClientSocket(
            {
                send(data: Uint8Array) {
                    socket.send(data);
                },
                close() {
                    socket.close();
                },
                terminate() {
                    socket.terminate();
                }
            },
            req.socket.remoteAddress ?? 'unknown'
        );

        socket.on('message', (message: Buffer<ArrayBufferLike>) => {
            try {
                if (client.state === -1 || client.remaining <= 0) {
                    client.terminate();
                    return;
                }

                client.buffer(message);

                if (client.state === 0) {
                    World.onClientData(client);
                } else if (client.state === 2) {
                    OnDemand.onClientData(client);
                }
            } catch {
                socket.terminate();
            }
        });

        socket.on('close', () => {
            client.state = -1;
            OnDemand.onClientClosed(client);

            if (client.player) {
                client.player.addSessionLog(LoggerEventType.ENGINE, 'WS socket closed');
                client.player.client = new NullClientSocket();
            }
        });

        socket.on('error', () => {
            socket.terminate();
        });
    }
});

fastify.get<{ Querystring: { plugin?: string; lowmem?: string } }>('/rs2.cgi', async (req, reply) => {
    const plugin = tryParseInt(req.query.plugin, 0);
    const lowmem = tryParseInt(req.query.lowmem, 0);

    if (Environment.node.debug && plugin === 1) {
        return reply.viewAsync('java.ejs', {
            portoff: Environment.node.port - 43594,
            nodeid: Environment.node.id,
            members: Environment.node.members,
            lowmem
        });
    } else {
        return reply.viewAsync('client.ejs', {
            nodeid: Environment.node.id,
            members: Environment.node.members,
            lowmem
        });
    }
});

// cache routes

fastify.get('/crc:cachebust', async (_req, reply) => {
    reply.send(CrcBuffer.data);
});

fastify.get<{ Params: { crc: string } }>('/title:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[1]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 1));
});

fastify.get<{ Params: { crc: string } }>('/config:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[2]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 2));
});

fastify.get<{ Params: { crc: string } }>('/interface:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[3]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 3));
});

fastify.get<{ Params: { crc: string } }>('/media:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[4]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 4));
});

fastify.get<{ Params: { crc: string } }>('/versionlist:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[5]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 5));
});

fastify.get<{ Params: { crc: string } }>('/textures:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[6]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 6));
});

fastify.get<{ Params: { crc: string } }>('/wordenc:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[7]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 7));
});

fastify.get<{ Params: { crc: string } }>('/sounds:crc', async (req, reply) => {
    const { crc } = req.params;

    if (tryParseInt(crc, -1) !== CrcTable[8]) {
        reply.status(404);
        return;
    }

    reply.send(OnDemand.cache.read(0, 8));
});

// hiscore & activity routes

const HISCORES_PAGE_SIZE = 25;

type HiscoreCategoryMeta = {
    name: string;
    hiscoreType: number;
    large: boolean;
    icon: string;
};

type HiscoreRow = {
    rank: number;
    username: string;
    level: number;
    value: number;
};

type HiscorePlayerStat = {
    name: string;
    icon: string;
    level: number;
    value: number;
    rank: number | null;
};

// A player's rank/name icon uses a lowercase skill-name filename (e.g. attack.gif);
// RUNECRAFT is the one stat whose PlayerStat enum name doesn't match its icon file
// (runecrafting.gif), copied in from the approved mockup's assets/ folder.
const HISCORE_ICON_OVERRIDES: Record<string, string> = { RUNECRAFT: 'runecrafting' };

function hiscoreIconFor(rawStatName: string): string {
    return `${HISCORE_ICON_OVERRIDES[rawStatName] ?? rawStatName.toLowerCase()}.gif`;
}

const HISCORE_CATEGORIES: HiscoreCategoryMeta[] = (() => {
    const categories: HiscoreCategoryMeta[] = [{ name: 'Overall', hiscoreType: 0, large: true, icon: 'blank.gif' }];

    for (let stat = 0; stat < PlayerStatEnabled.length; stat++) {
        if (!PlayerStatEnabled[stat]) {
            continue;
        }

        const rawName = PlayerStatNameMap.get(stat);
        if (!rawName) {
            continue;
        }

        categories.push({
            name: rawName.charAt(0) + rawName.slice(1).toLowerCase(),
            hiscoreType: stat + 1,
            large: false,
            icon: hiscoreIconFor(rawName)
        });
    }

    return categories;
})();

async function countHiscoreCategoryRows(category: HiscoreCategoryMeta): Promise<number> {
    if (category.large) {
        const result = await db
            .selectFrom('hiscore_large')
            .where('type', '=', category.hiscoreType)
            .select(({ fn }) => fn.countAll().as('count'))
            .executeTakeFirst();
        return Number(result?.count ?? 0);
    }

    const result = await db
        .selectFrom('hiscore')
        .where('type', '=', category.hiscoreType)
        .select(({ fn }) => fn.countAll().as('count'))
        .executeTakeFirst();
    return Number(result?.count ?? 0);
}

async function queryHiscoreCategoryPage(category: HiscoreCategoryMeta, limit: number, offset: number): Promise<Array<{ username: string; level: number; value: number }>> {
    if (category.large) {
        return db
            .selectFrom('hiscore_large')
            .innerJoin('account', 'account.id', 'hiscore_large.account_id')
            .select(['account.username', 'hiscore_large.level', 'hiscore_large.value'])
            .where('hiscore_large.type', '=', category.hiscoreType)
            .orderBy('hiscore_large.value', 'desc')
            .limit(limit)
            .offset(offset)
            .execute();
    }

    return db
        .selectFrom('hiscore')
        .innerJoin('account', 'account.id', 'hiscore.account_id')
        .select(['account.username', 'hiscore.level', 'hiscore.value'])
        .where('hiscore.type', '=', category.hiscoreType)
        .orderBy('hiscore.value', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();
}

async function rankForHiscoreValue(category: HiscoreCategoryMeta, value: number): Promise<number> {
    if (category.large) {
        const result = await db
            .selectFrom('hiscore_large')
            .where('type', '=', category.hiscoreType)
            .where('value', '>', value)
            .select(({ fn }) => fn.countAll().as('count'))
            .executeTakeFirst();
        return Number(result?.count ?? 0) + 1;
    }

    const result = await db
        .selectFrom('hiscore')
        .where('type', '=', category.hiscoreType)
        .where('value', '>', value)
        .select(({ fn }) => fn.countAll().as('count'))
        .executeTakeFirst();
    return Number(result?.count ?? 0) + 1;
}

async function findHiscoreRowByUsername(category: HiscoreCategoryMeta, username: string): Promise<{ username: string; level: number; value: number } | undefined> {
    if (category.large) {
        return db
            .selectFrom('hiscore_large')
            .innerJoin('account', 'account.id', 'hiscore_large.account_id')
            .select(['account.username', 'hiscore_large.level', 'hiscore_large.value'])
            .where('hiscore_large.type', '=', category.hiscoreType)
            .where(db.fn('lower', ['account.username']), '=', username.toLowerCase())
            .executeTakeFirst();
    }

    return db
        .selectFrom('hiscore')
        .innerJoin('account', 'account.id', 'hiscore.account_id')
        .select(['account.username', 'hiscore.level', 'hiscore.value'])
        .where('hiscore.type', '=', category.hiscoreType)
        .where(db.fn('lower', ['account.username']), '=', username.toLowerCase())
        .executeTakeFirst();
}

async function findHiscorePlayerCategoryStat(category: HiscoreCategoryMeta, accountId: number): Promise<{ level: number; value: number } | undefined> {
    if (category.large) {
        return db.selectFrom('hiscore_large').select(['level', 'value']).where('account_id', '=', accountId).where('type', '=', category.hiscoreType).executeTakeFirst();
    }

    return db.selectFrom('hiscore').select(['level', 'value']).where('account_id', '=', accountId).where('type', '=', category.hiscoreType).executeTakeFirst();
}

fastify.get<{ Querystring: { category?: string; page?: string; search?: string } }>('/hiscores', async (req, reply) => {
    const categoryParam = tryParseString(req.query.category, HISCORE_CATEGORIES[0].name);
    const category = HISCORE_CATEGORIES.find(c => c.name.toLowerCase() === categoryParam.toLowerCase()) ?? HISCORE_CATEGORIES[0];

    let page = tryParseInt(req.query.page, 1);
    if (!Number.isFinite(page) || page < 1) {
        page = 1;
    }

    const searchValue = (req.query.search ?? '').trim();
    let highlightRank: number | null = null;
    let searchNotFound = false;

    if (searchValue) {
        if (/^\d+$/.test(searchValue)) {
            highlightRank = parseInt(searchValue, 10);
        } else {
            const found = await findHiscoreRowByUsername(category, searchValue);
            if (found) {
                highlightRank = await rankForHiscoreValue(category, found.value);
            }
        }

        if (highlightRank !== null && highlightRank >= 1) {
            page = Math.ceil(highlightRank / HISCORES_PAGE_SIZE);
        } else {
            searchNotFound = true;
        }
    }

    const total = await countHiscoreCategoryRows(category);
    const totalPages = Math.max(1, Math.ceil(total / HISCORES_PAGE_SIZE));
    page = Math.min(page, totalPages);

    const offset = (page - 1) * HISCORES_PAGE_SIZE;
    const pageRows = await queryHiscoreCategoryPage(category, HISCORES_PAGE_SIZE, offset);

    const rows: HiscoreRow[] = pageRows.map((row, index) => ({
        rank: offset + index + 1,
        username: row.username,
        level: row.level,
        value: row.value
    }));

    return reply.viewAsync('hiscores.ejs', {
        categories: HISCORE_CATEGORIES,
        selectedCategory: category.name,
        rows,
        page,
        totalPages,
        highlightRank,
        searchValue,
        searchNotFound
    });
});

fastify.get<{ Params: { username: string } }>('/hiscores/player/:username', async (req, reply) => {
    const requestedUsername = req.params.username;

    const account = await db
        .selectFrom('account')
        .select(['id', 'username'])
        .where(db.fn('lower', ['username']), '=', requestedUsername.toLowerCase())
        .executeTakeFirst();

    if (!account) {
        reply.status(404);
        return reply.viewAsync('hiscores-player.ejs', { username: requestedUsername, found: false, stats: [] as HiscorePlayerStat[] });
    }

    const stats: HiscorePlayerStat[] = [];
    for (const category of HISCORE_CATEGORIES) {
        const stat = await findHiscorePlayerCategoryStat(category, account.id);
        stats.push({
            name: category.name,
            icon: category.icon,
            level: stat?.level ?? 0,
            value: stat?.value ?? 0,
            rank: stat ? await rankForHiscoreValue(category, stat.value) : null
        });
    }

    return reply.viewAsync('hiscores-player.ejs', { username: account.username, found: true, stats });
});

const ACTIVITY_PAGE_SIZE = 50;

fastify.get<{ Querystring: { search?: string; page?: string } }>('/activity', async (req, reply) => {
    const search = tryParseString(req.query.search, '').trim();
    const page = Math.max(1, tryParseInt(req.query.page, 1));
    const offset = (page - 1) * ACTIVITY_PAGE_SIZE;

    let logsQuery = db.selectFrom('session_log').select(['id', 'timestamp', 'event']).where('event_type', '=', LoggerEventType.ADVENTURE);

    if (search) {
        // session_log has no separate username column - the display name is
        // embedded directly in the free-text `event` message (e.g. "<name>
        // levelled up ..."), so a name search is a substring match over it.
        logsQuery = logsQuery.where('event', 'like', `%${search}%`);
    }

    // Fetch one row past the page size to know whether a next page exists,
    // without a separate COUNT query.
    const rows = await logsQuery
        .orderBy('id', 'desc')
        .limit(ACTIVITY_PAGE_SIZE + 1)
        .offset(offset)
        .execute();

    const hasNextPage = rows.length > ACTIVITY_PAGE_SIZE;
    const logs = rows.slice(0, ACTIVITY_PAGE_SIZE).map(row => ({
        id: row.id,
        event: row.event,
        // Serialized as UTC ISO 8601 here; activity.ejs formats it into the
        // viewer's browser-local timezone client-side.
        timestamp: toIsoTimestamp(row.timestamp)
    }));

    return reply.viewAsync('activity.ejs', { logs, search, page, hasNextPage });
});

// item source lookup route

fastify.get<{ Querystring: { q?: string } }>('/items', async (req, reply) => {
    const query = req.query.q ?? '';
    const results = query.trim() ? searchItemSources(query) : null;

    return reply.viewAsync('items.ejs', { query, results });
});

// NPC lookup route

fastify.get<{ Querystring: { q?: string } }>('/npc', async (req, reply) => {
    const query = req.query.q ?? '';
    const results = query.trim() ? searchNpcSources(query) : null;

    return reply.viewAsync('npc.ejs', { query, results });
});

// commands docs route

const sortedCommandDocs = [...commandDocs].sort((a, b) => a.command.localeCompare(b.command));

fastify.get('/commands', async (_req, reply) => {
    return reply.viewAsync('commands.ejs', { commands: sortedCommandDocs, tierLabels: CommandTierLabel });
});

// world map routes

fastify.get('/worldmap.jag', async (_req, reply) => {
    const filePath = 'data/pack/mapview/worldmap.jag';

    if (!fileExists(filePath)) {
        reply.status(404);
        return;
    }

    return reply.type('application/octet-stream').send(fs.createReadStream(filePath));
});

fastify.get<{ Querystring: { x?: string; z?: string } }>('/worldmap', async (req, reply) => {
    const x = tryParseInt(req.query.x, -1);
    const z = tryParseInt(req.query.z, -1);
    const highlight = x >= 0 && z >= 0 ? { x, z } : null;

    return reply.viewAsync('worldmap.ejs', { highlight });
});

// map editor routes

if (Environment.node.debug) {
    fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
        done(null, body);
    });

    fastify.get('/maped', async (_req, reply) => {
        return reply.viewAsync('maped.ejs');
    });

    if (fs.existsSync(Environment.build.srcDir)) {
        await fastify.register(FastifyStatic, {
            root: path.resolve(Environment.build.srcDir),
            prefix: '/content/',
            decorateReply: false
        });
    }

    await fastify.register(FastifyStatic, {
        root: path.join(process.cwd(), 'data'),
        prefix: '/data/',
        decorateReply: false
    });

    fastify.put<{ Params: { '*': string } }>('/content/*', async (req, reply) => {
        const filePath = resolveContentPath(req.params['*']);
        if (!filePath) {
            reply.status(400);
            return;
        }

        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, req.body as Uint8Array);
    });
}

fastify.register(FastifyStatic, {
    root: path.join(process.cwd(), 'public')
});

export async function startWeb() {
    await fastify.listen({ port: Environment.web.port, host: '0.0.0.0' });
}

// management routes

const management = Fastify();

management.register(FastifyView, {
    engine: {
        ejs
    },
    root: 'view'
});

management.get('/prometheus', async (_req, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
});

management.get('/setup', async (_req, reply) => {
    return reply.viewAsync('setup.ejs');
});

management.get('/setup/config', async () => {
    return {
        config: loadWorldConfig(),
        defaults: createDefaultWorldConfig(),
        path: 'data/config/world.json'
    };
});

management.put('/setup/config', async req => {
    const config = normalizeWorldConfig(req.body);
    saveWorldConfig(config);

    return {
        config,
        restartRequired: true
    };
});

export async function startManagementWeb() {
    await management.listen({ port: Environment.web.managementPort, host: '0.0.0.0' });
}
