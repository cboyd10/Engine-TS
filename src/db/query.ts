import { Kysely, MysqlDialect } from 'kysely';
import type { Dialect, LogEvent } from 'kysely';
import { createPool } from 'mysql2';
import { DatabaseSync } from 'node:sqlite';

import { DB } from '#/db/types.js';
import { NodeSqliteDialect } from '#/db/dialect/NodeSqliteDialect.js';
import Environment from '#/util/Environment.js';

let dialect: Dialect;

if (Environment.db.backend === 'sqlite') {
    dialect = new NodeSqliteDialect({
        database: new DatabaseSync('db.sqlite')
    });
} else {
    dialect = new MysqlDialect({
        pool: async () =>
            createPool({
                database: Environment.db.name,
                host: Environment.db.host,
                port: Environment.db.port,
                user: Environment.db.user,
                password: Environment.db.pass,
                timezone: 'Z'
            })
    });
}

function logVerbose(event: LogEvent) {
    if (event.level === 'query') {
        console.log(event.query.sql);
        console.log(event.query.parameters);
    }
}

export const db = new Kysely<DB>({
    dialect,
    log: Environment.db.verbose ? logVerbose : []
});

export function toDbDate(date: Date | string | number) {
    if (typeof date === 'string' || typeof date === 'number') {
        date = new Date(date);
    }

    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// The mysql2 driver returns DATETIME columns as JS `Date` instances at
// runtime (despite Kysely's generated column type being `string`), while
// the sqlite dialect may hand back an ISO-ish string instead. Normalize
// either shape to a UTC ISO 8601 string so views can serialize timestamps
// for client-side, viewer-local-timezone formatting instead of relying on
// EJS's implicit `<%= %>` -> `String(Date)` coercion (which renders in the
// server process's local timezone).
export function toIsoTimestamp(date: Date | string | number) {
    if (typeof date === 'string' || typeof date === 'number') {
        date = new Date(date);
    }

    return date.toISOString();
}
