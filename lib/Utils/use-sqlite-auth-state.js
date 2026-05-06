"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSqliteAuthState = void 0;
const use_custom_auth_state_1 = require("./use-custom-auth-state");
/**
 * SQLite-backed auth (single .db file, one row per key). Requires optional dependency `better-sqlite3`:
 * `npm install better-sqlite3`
 */
const useSqliteAuthState = async (databaseFilePath) => {
    let Database;
    try {
        Database = require('better-sqlite3');
    }
    catch (_a) {
        throw new Error('useSqliteAuthState requires better-sqlite3: npm install better-sqlite3');
    }
    const db = new Database(databaseFilePath);
    db.exec(`
CREATE TABLE IF NOT EXISTS elaina-baileys_auth_kv (
  k TEXT PRIMARY KEY NOT NULL,
  v TEXT NOT NULL
)`);
    const sel = db.prepare('SELECT v FROM elaina-baileys_auth_kv WHERE k = ?');
    const upsert = db.prepare('INSERT OR REPLACE INTO elaina-baileys_auth_kv (k, v) VALUES (?, ?)');
    const del = db.prepare('DELETE FROM elaina-baileys_auth_kv WHERE k = ?');
    return (0, use_custom_auth_state_1.useCustomAuthState)({
        get: async (key) => {
            const row = sel.get(key);
            return row ? row.v : null;
        },
        set: async (key, value) => {
            upsert.run(key, value);
        },
        remove: async (key) => {
            del.run(key);
        }
    });
};
exports.useSqliteAuthState = useSqliteAuthState;
