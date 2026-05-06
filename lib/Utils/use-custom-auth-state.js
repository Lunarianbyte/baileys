"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCustomAuthState = exports.fixAuthStorageKey = void 0;
const async_mutex_1 = require("async-mutex");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const keyLocks = new Map();
const getKeyLock = (storageKey) => {
    let mutex = keyLocks.get(storageKey);
    if (!mutex) {
        mutex = new async_mutex_1.Mutex();
        keyLocks.set(storageKey, mutex);
    }
    return mutex;
};
/**
 * Normalizes logical filenames (same rules as multi-file auth) for use as KV keys in any backend.
 */
const fixAuthStorageKey = (file) => {
    var _a;
    return (_a = file === null || file === void 0 ? void 0 : file.replace(/\//g, '__')) === null || _a === void 0 ? void 0 : _a.replace(/:/g, '-');
};
exports.fixAuthStorageKey = fixAuthStorageKey;
/**
 * Pluggable auth persistence: implement get/set/remove for string keys and JSON string values.
 * Use for SQLite, Redis, MongoDB, cloud HTTP APIs, or any database — same shape as `useMultiFileAuthState`.
 */
const useCustomAuthState = async (adapter) => {
    if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function' || typeof adapter.remove !== 'function') {
        throw new Error('useCustomAuthState: adapter must implement get(key), set(key, jsonString), remove(key)');
    }
    const readData = async (file) => {
        const storageKey = fixAuthStorageKey(file);
        const mutex = getKeyLock(storageKey);
        return mutex.acquire().then(async (release) => {
            try {
                const raw = await adapter.get(storageKey);
                if (raw == null || raw === '') {
                    return null;
                }
                return JSON.parse(raw, generics_1.BufferJSON.reviver);
            }
            catch (_a) {
                return null;
            }
            finally {
                release();
            }
        });
    };
    const writeData = async (data, file) => {
        const storageKey = fixAuthStorageKey(file);
        const mutex = getKeyLock(storageKey);
        return mutex.acquire().then(async (release) => {
            try {
                await adapter.set(storageKey, JSON.stringify(data, generics_1.BufferJSON.replacer));
            }
            finally {
                release();
            }
        });
    };
    const removeData = async (file) => {
        const storageKey = fixAuthStorageKey(file);
        const mutex = getKeyLock(storageKey);
        return mutex.acquire().then(async (release) => {
            try {
                await adapter.remove(storageKey);
            }
            finally {
                release();
            }
        });
    };
    const creds = (await readData('creds.json')) || (0, auth_utils_1.initAuthCreds)();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`);
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            return writeData(creds, 'creds.json');
        }
    };
};
exports.useCustomAuthState = useCustomAuthState;
