import { QueryIds, XWAPaths } from '../Types/index.js';
import { decryptMessageNode, generateMessageID, generateProfilePicture } from '../Utils/index.js';
import { getAllBinaryNodeChildren, getBinaryNodeChild, getBinaryNodeChildren, S_WHATSAPP_NET } from '../WABinary/index.js';
import { makeGroupsSocket } from './groups.js';
import { executeWMexQuery as genericExecuteWMexQuery } from './mex.js';

const encoder = new TextEncoder();

const parseNewsletterCreateResponse = (response) => {
    const metadata = extractNewsletterMetadataFromGraphQL(response, true);
    if (metadata) {
        return metadata;
    }
    const { id, thread_metadata: thread, viewer_metadata: viewer } = response;
    return {
        id,
        owner: undefined,
        name: thread?.name?.text,
        creation_time: parseInt(thread?.creation_time || '0', 10) || undefined,
        description: thread?.description?.text,
        invite: thread?.invite,
        subscribers: parseInt(thread?.subscribers_count || '0', 10) || undefined,
        verification: thread?.verification,
        picture: {
            id: thread?.picture?.id,
            directPath: thread?.picture?.direct_path
        },
        mute_state: viewer?.mute
    };
};

const parseNewsletterMetadata = (result) => {
    const extracted = extractNewsletterMetadataFromGraphQL(result, false);
    if (extracted) {
        return extracted;
    }
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    if ('id' in result && typeof result.id === 'string') {
        return result;
    }
    if ('result' in result && typeof result.result === 'object' && result.result !== null && 'id' in result.result) {
        return result.result;
    }
    return null;
};

const extractNewsletterMetadataFromGraphQL = (result, isCreate = false) => {
    const metadataPath = isCreate
        ? result
        : result?.result?.id
            ? result.result
            : result;

    if (!metadataPath || typeof metadataPath !== 'object' || !metadataPath.id) {
        return null;
    }

    const thread = metadataPath.thread_metadata || {};
    const viewer = metadataPath.viewer_metadata || {};
    const settings = thread.settings || {};

    const reactionCodes = Array.isArray(settings.reaction_codes)
        ? settings.reaction_codes
        : Array.isArray(settings.reaction_codes?.codes)
            ? settings.reaction_codes.codes
            : undefined;

    return {
        id: metadataPath.id,
        state: metadataPath?.state?.type,
        creation_time: thread?.creation_time ? +thread.creation_time : undefined,
        name: thread?.name?.text,
        nameTime: thread?.name?.update_time ? +thread.name.update_time : undefined,
        description: thread?.description?.text,
        descriptionTime: thread?.description?.update_time ? +thread.description.update_time : undefined,
        invite: thread?.invite,
        handle: thread?.handle,
        picture: {
            id: thread?.picture?.id,
            directPath: thread?.picture?.direct_path
        },
        preview: thread?.preview?.direct_path
            ? {
                directPath: thread.preview.direct_path,
                id: thread?.preview?.id
            }
            : undefined,
        reaction_codes: reactionCodes,
        subscribers: thread?.subscribers_count ? +thread.subscribers_count : undefined,
        verification: thread?.verification,
        viewer_metadata: viewer,
        mute_state: viewer?.mute
    };
};

export const extractNewsletterMetadata = extractNewsletterMetadataFromGraphQL;

export const makeNewsletterSocket = (config) => {
    const sock = makeGroupsSocket(config);
    const { authState, signalRepository, query, generateMessageTag } = sock;

    const executeWMexQuery = (variables, queryId, dataPath) => {
        return genericExecuteWMexQuery(variables, queryId, dataPath, query, generateMessageTag);
    };

    const newsletterQuery = async (jid, type, content) => {
        return query({
            tag: 'iq',
            attrs: {
                id: generateMessageTag(),
                type,
                xmlns: 'newsletter',
                to: jid
            },
            content
        });
    };

    const newsletterWMexQuery = async (jid, queryId, content, dataPath) => {
        const variables = {
            ...(jid ? { newsletter_id: jid } : {}),
            ...(content || {})
        };
        return executeWMexQuery(variables, queryId, dataPath);
    };

    const newsletterUpdate = async (jid, updates) => {
        const variables = {
            newsletter_id: jid,
            updates: {
                ...updates,
                settings: updates?.settings === undefined ? null : updates.settings
            }
        };
        return executeWMexQuery(variables, QueryIds.UPDATE_METADATA, 'xwa2_newsletter_update');
    };

    const parseFetchedUpdates = async (node, type) => {
        let child;
        if (type === 'messages') {
            child = getBinaryNodeChild(node, 'messages');
        }
        else {
            const parent = getBinaryNodeChild(node, 'message_updates');
            child = getBinaryNodeChild(parent, 'messages');
        }

        const messageNodes = child ? getAllBinaryNodeChildren(child) : [];
        return Promise.all(messageNodes.map(async (messageNode) => {
            messageNode.attrs.from = child?.attrs?.jid || messageNode.attrs.from;

            const views = parseInt(getBinaryNodeChild(messageNode, 'views_count')?.attrs?.count || '0', 10);
            const reactionNode = getBinaryNodeChild(messageNode, 'reactions');
            const reactions = getBinaryNodeChildren(reactionNode, 'reaction')
                .map(({ attrs }) => ({ count: +(attrs.count || 0), code: attrs.code }));

            const data = {
                server_id: messageNode.attrs.server_id,
                views,
                reactions
            };

            if (type === 'messages') {
                const { fullMessage: message, decrypt } = decryptMessageNode(
                    messageNode,
                    authState.creds.me.id,
                    authState.creds.me.lid || '',
                    signalRepository,
                    config.logger
                );
                await decrypt();
                data.message = message;
            }

            return data;
        }));
    };

    const resolveActionQueryId = (type) => {
        const value = QueryIds?.[String(type).toUpperCase()];
        if (!value) {
            throw new Error(`Unknown newsletter action: ${type}`);
        }
        return value;
    };

    return {
        ...sock,
        newsletterQuery,
        newsletterWMexQuery,
        newsletterCreate: async (name, description, picture) => {
            await query({
                tag: 'iq',
                attrs: {
                    to: S_WHATSAPP_NET,
                    xmlns: 'tos',
                    id: generateMessageTag(),
                    type: 'set'
                },
                content: [
                    {
                        tag: 'notice',
                        attrs: {
                            id: '20601218',
                            stage: '5'
                        },
                        content: []
                    }
                ]
            });

            const variables = {
                input: {
                    name,
                    description: description ?? null,
                    picture: picture ? (await generateProfilePicture(picture)).img.toString('base64') : null,
                    settings: {
                        reaction_codes: {
                            value: 'ALL'
                        }
                    }
                }
            };
            const rawResponse = await executeWMexQuery(variables, QueryIds.CREATE, XWAPaths.xwa2_newsletter_create);
            return parseNewsletterCreateResponse(rawResponse);
        },
        newsletterUpdate,
        newsletterSubscribers: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.SUBSCRIBERS, XWAPaths.xwa2_newsletter_subscribers);
        },
        newsletterMetadata: async (type, key, role = 'GUEST') => {
            const variables = {
                fetch_creation_time: true,
                fetch_full_image: true,
                fetch_viewer_metadata: true,
                input: {
                    key,
                    type: String(type).toUpperCase(),
                    view_role: role
                }
            };
            const result = await executeWMexQuery(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata);
            return parseNewsletterMetadata(result);
        },
        subscribeNewsletterUpdates: async (jid) => {
            const result = await newsletterQuery(jid, 'set', [{ tag: 'live_updates', attrs: {}, content: [] }]);
            const liveUpdatesNode = getBinaryNodeChild(result, 'live_updates');
            return liveUpdatesNode?.attrs || null;
        },
        newsletterReactionMode: async (jid, mode) => {
            return await newsletterUpdate(jid, {
                settings: {
                    reaction_codes: {
                        value: mode
                    }
                }
            });
        },
        newsletterFollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_follow);
        },
        newsletterUnfollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNFOLLOW, XWAPaths.xwa2_newsletter_unfollow);
        },
        newsletterMute: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.MUTE, XWAPaths.xwa2_newsletter_mute_v2);
        },
        newsletterUnmute: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNMUTE, XWAPaths.xwa2_newsletter_unmute_v2);
        },
        newsletterAction: async (jid, type) => {
            const queryId = resolveActionQueryId(type);
            return await newsletterWMexQuery(jid, queryId);
        },
        newsletterUpdateName: async (jid, name) => {
            return await newsletterUpdate(jid, { name });
        },
        newsletterUpdateDescription: async (jid, description) => {
            return await newsletterUpdate(jid, { description });
        },
        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await generateProfilePicture(content);
            return await newsletterUpdate(jid, { picture: img.toString('base64') });
        },
        newsletterRemovePicture: async (jid) => {
            return await newsletterUpdate(jid, { picture: '' });
        },
        newsletterFetchAllParticipating: async () => {
            throw new Error('newsletterFetchAllParticipating is not available in this lib build because the SUBSCRIBED query ID is not present in current Types/Newsletter definitions.');
        },
        newsletterAdminCount: async (jid) => {
            const response = await executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_COUNT, XWAPaths.xwa2_newsletter_admin_count);
            return response.admin_count;
        },
        newsletterChangeOwner: async (jid, newOwnerJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: newOwnerJid }, QueryIds.CHANGE_OWNER, XWAPaths.xwa2_newsletter_change_owner);
        },
        newsletterDemote: async (jid, userJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.DEMOTE, XWAPaths.xwa2_newsletter_demote);
        },
        newsletterDelete: async (jid) => {
            await executeWMexQuery({ newsletter_id: jid }, QueryIds.DELETE, XWAPaths.xwa2_newsletter_delete_v2);
        },
        newsletterReactMessage: async (jid, serverId, reaction) => {
            await query({
                tag: 'message',
                attrs: {
                    to: jid,
                    ...(reaction ? {} : { edit: '7' }),
                    type: 'reaction',
                    server_id: serverId,
                    id: generateMessageID()
                },
                content: [
                    {
                        tag: 'reaction',
                        attrs: reaction ? { code: reaction } : {}
                    }
                ]
            });
        },
        newsletterFetchMessages: async (...args) => {
            if (typeof args[0] === 'string' && (args[0] === 'invite' || args[0] === 'jid')) {
                const [type, key, count, after] = args;
                const result = await newsletterQuery(S_WHATSAPP_NET, 'get', [
                    {
                        tag: 'messages',
                        attrs: {
                            type,
                            ...(type === 'invite' ? { key } : { jid: key }),
                            count: String(count),
                            after: after?.toString() || '100'
                        }
                    }
                ]);
                return await parseFetchedUpdates(result, 'messages');
            }

            const [jid, count, since, after] = args;
            const messageUpdateAttrs = {
                count: count.toString(),
                ...(typeof since === 'number' ? { since: since.toString() } : {}),
                ...(after !== undefined && after !== null ? { after: after.toString() } : {})
            };
            const result = await newsletterQuery(jid, 'get', [
                {
                    tag: 'message_updates',
                    attrs: messageUpdateAttrs
                }
            ]);
            return result;
        },
        newsletterFetchUpdates: async (jid, count, after, since) => {
            const result = await newsletterQuery(jid, 'get', [
                {
                    tag: 'message_updates',
                    attrs: {
                        count: String(count),
                        after: after?.toString() || '100',
                        since: since?.toString() || '0'
                    }
                }
            ]);
            return await parseFetchedUpdates(result, 'updates');
        }
    };
};
//# sourceMappingURL=newsletter.js.map
