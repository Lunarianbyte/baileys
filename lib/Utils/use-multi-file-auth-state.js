"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMultiFileAuthState = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const use_custom_auth_state_1 = require("./use-custom-auth-state");
/**
 * Local filesystem auth (JSON files). Same data model as `useCustomAuthState` / cloud DB adapters.
 */
const useMultiFileAuthState = async (folder) => {
    const folderInfo = await (0, promises_1.stat)(folder).catch(() => { });
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
        }
    }
    else {
        await (0, promises_1.mkdir)(folder, { recursive: true });
    }
    return (0, use_custom_auth_state_1.useCustomAuthState)({
        get: async (key) => {
            try {
                const filePath = (0, path_1.join)(folder, key);
                return await (0, promises_1.readFile)(filePath, { encoding: 'utf-8' });
            }
            catch (_a) {
                return null;
            }
        },
        set: async (key, value) => {
            const filePath = (0, path_1.join)(folder, key);
            await (0, promises_1.writeFile)(filePath, value, 'utf-8');
        },
        remove: async (key) => {
            try {
                await (0, promises_1.unlink)((0, path_1.join)(folder, key));
            }
            catch (_a) {
            }
        }
    });
};
exports.useMultiFileAuthState = useMultiFileAuthState;
