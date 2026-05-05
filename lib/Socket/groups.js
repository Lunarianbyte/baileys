import { proto } from '../../WAProto/index.js';
import { WAMessageAddressingMode, WAMessageStubType } from '../Types/index.js';
import { generateMessageIDV2, unixTimestampSeconds } from '../Utils/index.js';
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString, isLidUser, isPnUser, jidEncode, jidNormalizedUser } from '../WABinary/index.js';
import { makeChatsSocket } from './chats.js';
export const makeGroupsSocket = (config) => {
    const sock = makeChatsSocket(config);
    const { authState, ev, query, upsertMessage } = sock;
    const { cachedGroupMetadata } = config;
    // ── Built-in group metadata cache ─────────────────────────────────────────
    const groupMetadataCache = new Map();
    const GROUP_CACHE_TTL = (config.groupCacheTTL || 5) * 60 * 1000; // default 5 menit
    const getCachedGroupMetadata = async (jid) => {
        // 1. Cek user-provided cachedGroupMetadata (dari config makeWASocket)
        if (cachedGroupMetadata) {
            const cached = await cachedGroupMetadata(jid);
            if (cached && Array.isArray(cached.participants)) return cached;
        }
        // 2. Cek internal Map cache
        const entry = groupMetadataCache.get(jid);
        if (entry && Date.now() - entry.ts < GROUP_CACHE_TTL) {
            return entry.data;
        }
        return undefined;
    };
    const setCachedGroupMetadata = (jid, data) => {
        groupMetadataCache.set(jid, { data, ts: Date.now() });
    };
    // Update cache saat groups.update event
    ev.on('groups.update', (updates) => {
        for (const update of updates) {
            const entry = groupMetadataCache.get(update.id);
            if (entry) {
                // Merge update ke cache yang ada
                groupMetadataCache.set(update.id, {
                    data: { ...entry.data, ...update },
                    ts: entry.ts
                });
            }
        }
    });
    // Update cache saat participant berubah
    // Debounce map to prevent duplicate refresh calls for same group
    const _refreshDebounce = new Map();
    const _refreshGroupMetadata = async (jid) => {
        // Debounce: skip jika refresh sudah dijadwalkan dalam 2 detik terakhir
        if (_refreshDebounce.has(jid)) return;
        _refreshDebounce.set(jid, true);
        setTimeout(() => _refreshDebounce.delete(jid), 2000);
        try {
            const result = await groupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }]);
            const meta = extractGroupMetadata(result);
            setCachedGroupMetadata(jid, meta);
            // Emit groups.update agar subscriber luar (makeInMemoryStore dll) ikut terupdate
            ev.emit('groups.update', [meta]);
        } catch (e) {
            // Ignore jika gagal (bot mungkin sudah keluar dari grup)
        }
    };
    ev.on('group-participants.update', ({ id, participants, action }) => {
        const entry = groupMetadataCache.get(id);
        if (entry && Array.isArray(entry.data?.participants)) {
            // Fast-path: update cache lokal secara optimistis tanpa tunggu network
            const meta = { ...entry.data, participants: [...entry.data.participants] };
            if (action === 'add') {
                const existing = new Set(meta.participants.map(p => p.id));
                for (const jid of participants) {
                    if (!existing.has(jid)) meta.participants.push({ id: jid, admin: null });
                }
            } else if (action === 'remove') {
                meta.participants = meta.participants.filter(p => !participants.includes(p.id));
            } else if (action === 'promote') {
                meta.participants = meta.participants.map(p =>
                    participants.includes(p.id) ? { ...p, admin: 'admin' } : p
                );
            } else if (action === 'demote') {
                meta.participants = meta.participants.map(p =>
                    participants.includes(p.id) ? { ...p, admin: null } : p
                );
            }
            groupMetadataCache.set(id, { data: meta, ts: entry.ts });
        }
        // Auto-refresh dari network untuk semua aksi participant
        // Ini memastikan data selalu akurat dari server WA
        _refreshGroupMetadata(id);
    });
    // ── End group metadata cache ───────────────────────────────────────────────
    const groupQuery = async (jid, type, content) => query({
        tag: 'iq',
        attrs: {
            type,
            xmlns: 'w:g2',
            to: jid
        },
        content
    });
    const groupMetadata = async (jid) => {
        // Cek cache dulu sebelum hit network
        const cached = await getCachedGroupMetadata(jid);
        if (cached) return cached;
        // Fetch dari WA
        const result = await groupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }]);
        const meta = extractGroupMetadata(result);
        // Simpan ke cache
        setCachedGroupMetadata(jid, meta);
        return meta;
    };
    const groupFetchAllParticipating = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: '@g.us',
                xmlns: 'w:g2',
                type: 'get'
            },
            content: [
                {
                    tag: 'participating',
                    attrs: {},
                    content: [
                        { tag: 'participants', attrs: {} },
                        { tag: 'description', attrs: {} }
                    ]
                }
            ]
        });
        const data = {};
        const groupsChild = getBinaryNodeChild(result, 'groups');
        if (groupsChild) {
            const groups = getBinaryNodeChildren(groupsChild, 'group');
            for (const groupNode of groups) {
                const meta = extractGroupMetadata({
                    tag: 'result',
                    attrs: {},
                    content: [groupNode]
                });
                data[meta.id] = meta;
            }
        }
        // TODO: properly parse LID / PN DATA
        sock.ev.emit('groups.update', Object.values(data));
        return data;
    };
    sock.ws.on('CB:ib,,dirty', async (node) => {
        const { attrs } = getBinaryNodeChild(node, 'dirty');
        if (attrs.type !== 'groups') {
            return;
        }
        await groupFetchAllParticipating();
        await sock.cleanDirtyBits('groups');
    });
    return {
        ...sock,
        groupMetadata,
        groupCreate: async (subject, participants) => {
            const key = generateMessageIDV2();
            const result = await groupQuery('@g.us', 'set', [
                {
                    tag: 'create',
                    attrs: {
                        subject,
                        key
                    },
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            return extractGroupMetadata(result);
        },
        groupLeave: async (id) => {
            await groupQuery('@g.us', 'set', [
                {
                    tag: 'leave',
                    attrs: {},
                    content: [{ tag: 'group', attrs: { id } }]
                }
            ]);
        },
        groupUpdateSubject: async (jid, subject) => {
            await groupQuery(jid, 'set', [
                {
                    tag: 'subject',
                    attrs: {},
                    content: Buffer.from(subject, 'utf-8')
                }
            ]);
        },
        groupRequestParticipantsList: async (jid) => {
            const result = await groupQuery(jid, 'get', [
                {
                    tag: 'membership_approval_requests',
                    attrs: {}
                }
            ]);
            const node = getBinaryNodeChild(result, 'membership_approval_requests');
            const participants = getBinaryNodeChildren(node, 'membership_approval_request');
            return participants.map(v => v.attrs);
        },
        groupRequestParticipantsUpdate: async (jid, participants, action) => {
            const result = await groupQuery(jid, 'set', [
                {
                    tag: 'membership_requests_action',
                    attrs: {},
                    content: [
                        {
                            tag: action,
                            attrs: {},
                            content: participants.map(jid => ({
                                tag: 'participant',
                                attrs: { jid }
                            }))
                        }
                    ]
                }
            ]);
            const node = getBinaryNodeChild(result, 'membership_requests_action');
            const nodeAction = getBinaryNodeChild(node, action);
            const participantsAffected = getBinaryNodeChildren(nodeAction, 'participant');
            return participantsAffected.map(p => {
                return { status: p.attrs.error || '200', jid: p.attrs.jid };
            });
        },
        groupParticipantsUpdate: async (jid, participants, action) => {
            const result = await groupQuery(jid, 'set', [
                {
                    tag: action,
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            const node = getBinaryNodeChild(result, action);
            const participantsAffected = getBinaryNodeChildren(node, 'participant');
            return participantsAffected.map(p => {
                return { status: p.attrs.error || '200', jid: p.attrs.jid, content: p };
            });
        },
        groupUpdateDescription: async (jid, description) => {
            const metadata = await groupMetadata(jid);
            const prev = metadata.descId ?? null;
            await groupQuery(jid, 'set', [
                {
                    tag: 'description',
                    attrs: {
                        ...(description ? { id: generateMessageIDV2() } : { delete: 'true' }),
                        ...(prev ? { prev } : {})
                    },
                    content: description ? [{ tag: 'body', attrs: {}, content: Buffer.from(description, 'utf-8') }] : undefined
                }
            ]);
        },
        groupInviteCode: async (jid) => {
            const result = await groupQuery(jid, 'get', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupRevokeInvite: async (jid) => {
            const result = await groupQuery(jid, 'set', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupAcceptInvite: async (code) => {
            const results = await groupQuery('@g.us', 'set', [{ tag: 'invite', attrs: { code } }]);
            const result = getBinaryNodeChild(results, 'group');
            return result?.attrs.jid;
        },
        /**
         * revoke a v4 invite for someone
         * @param groupJid group jid
         * @param invitedJid jid of person you invited
         * @returns true if successful
         */
        groupRevokeInviteV4: async (groupJid, invitedJid) => {
            const result = await groupQuery(groupJid, 'set', [
                { tag: 'revoke', attrs: {}, content: [{ tag: 'participant', attrs: { jid: invitedJid } }] }
            ]);
            return !!result;
        },
        /**
         * accept a GroupInviteMessage
         * @param key the key of the invite message, or optionally only provide the jid of the person who sent the invite
         * @param inviteMessage the message to accept
         */
        groupAcceptInviteV4: ev.createBufferedFunction(async (key, inviteMessage) => {
            key = typeof key === 'string' ? { remoteJid: key } : key;
            const results = await groupQuery(inviteMessage.groupJid, 'set', [
                {
                    tag: 'accept',
                    attrs: {
                        code: inviteMessage.inviteCode,
                        expiration: inviteMessage.inviteExpiration.toString(),
                        admin: key.remoteJid
                    }
                }
            ]);
            // if we have the full message key
            // update the invite message to be expired
            if (key.id) {
                // create new invite message that is expired
                inviteMessage = proto.Message.GroupInviteMessage.fromObject(inviteMessage);
                inviteMessage.inviteExpiration = 0;
                inviteMessage.inviteCode = '';
                ev.emit('messages.update', [
                    {
                        key,
                        update: {
                            message: {
                                groupInviteMessage: inviteMessage
                            }
                        }
                    }
                ]);
            }
            // generate the group add message
            await upsertMessage({
                key: {
                    remoteJid: inviteMessage.groupJid,
                    id: generateMessageIDV2(sock.user?.id),
                    fromMe: false,
                    participant: key.remoteJid
                },
                messageStubType: WAMessageStubType.GROUP_PARTICIPANT_ADD,
                messageStubParameters: [JSON.stringify(authState.creds.me)],
                participant: key.remoteJid,
                messageTimestamp: unixTimestampSeconds()
            }, 'notify');
            return results.attrs.from;
        }),
        groupGetInviteInfo: async (code) => {
            const results = await groupQuery('@g.us', 'get', [{ tag: 'invite', attrs: { code } }]);
            return extractGroupMetadata(results);
        },
        groupToggleEphemeral: async (jid, ephemeralExpiration) => {
            const content = ephemeralExpiration
                ? { tag: 'ephemeral', attrs: { expiration: ephemeralExpiration.toString() } }
                : { tag: 'not_ephemeral', attrs: {} };
            await groupQuery(jid, 'set', [content]);
        },
        groupSettingUpdate: async (jid, setting) => {
            await groupQuery(jid, 'set', [{ tag: setting, attrs: {} }]);
        },
        groupMemberAddMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [{ tag: 'member_add_mode', attrs: {}, content: mode }]);
        },
        groupJoinApprovalMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [
                { tag: 'membership_approval_mode', attrs: {}, content: [{ tag: 'group_join', attrs: { state: mode } }] }
            ]);
        },
        groupFetchAllParticipating,
        /**
         * Auto detect isAdmin & isBotAdmin dari groupMetadata
         * @param {string} groupJid - JID grup
         * @param {string} senderJid - JID pengirim pesan
         * @returns {Promise<{isAdmin: boolean, isBotAdmin: boolean}>}
         */
        getAdminStatus: async (groupJid, senderJid) => {
            const normalizeJid = (jid) => {
                if (!jid) return null;
                try {
                    return jidNormalizedUser(jid).split('@')[0];
                } catch {
                    return String(jid).split('@')[0];
                }
            };
            const botJid = sock.authState?.creds?.me?.id;
            const meta = await sock.groupMetadata(groupJid).catch(() => null);
            if (!meta || !Array.isArray(meta.participants)) {
                return { isAdmin: false, isBotAdmin: false };
            }
            const senderNorm = normalizeJid(senderJid);
            const botNorm = normalizeJid(botJid);
            const isAdmin = meta.participants.some(p => {
                const pid = normalizeJid(p.jid || p.id || p.lid);
                return pid === senderNorm && (p.admin === 'admin' || p.admin === 'superadmin');
            });
            // Cek isBotAdmin: via participants
            let isBotAdmin = meta.participants.some(p => {
                const pid = normalizeJid(p.jid || p.id || p.lid);
                return pid === botNorm && (p.admin === 'admin' || p.admin === 'superadmin');
            });
            // Fallback: cek via owner/subjectOwner
            if (!isBotAdmin) {
                const owners = [meta.owner, meta.subjectOwner, meta.ownerPn]
                    .filter(Boolean)
                    .map(normalizeJid);
                if (owners.includes(botNorm)) isBotAdmin = true;
            }
            return { isAdmin, isBotAdmin };
        }
    };
};
export const extractGroupMetadata = (result) => {
    const group = getBinaryNodeChild(result, 'group');
    const descChild = getBinaryNodeChild(group, 'description');
    let desc;
    let descId;
    let descOwner;
    let descOwnerPn;
    let descTime;
    if (descChild) {
        desc = getBinaryNodeChildString(descChild, 'body');
        descOwner = descChild.attrs.participant ? jidNormalizedUser(descChild.attrs.participant) : undefined;
        descOwnerPn = descChild.attrs.participant_pn ? jidNormalizedUser(descChild.attrs.participant_pn) : undefined;
        descTime = +descChild.attrs.t;
        descId = descChild.attrs.id;
    }
    const groupId = group.attrs.id.includes('@') ? group.attrs.id : jidEncode(group.attrs.id, 'g.us');
    const eph = getBinaryNodeChild(group, 'ephemeral')?.attrs.expiration;
    const memberAddMode = getBinaryNodeChildString(group, 'member_add_mode') === 'all_member_add';
    const metadata = {
        id: groupId,
        notify: group.attrs.notify,
        addressingMode: group.attrs.addressing_mode === 'lid' ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN,
        subject: group.attrs.subject,
        subjectOwner: group.attrs.s_o,
        subjectOwnerPn: group.attrs.s_o_pn,
        subjectTime: +group.attrs.s_t,
        size: group.attrs.size ? +group.attrs.size : getBinaryNodeChildren(group, 'participant').length,
        creation: +group.attrs.creation,
        owner: group.attrs.creator ? jidNormalizedUser(group.attrs.creator) : undefined,
        ownerPn: group.attrs.creator_pn ? jidNormalizedUser(group.attrs.creator_pn) : undefined,
        owner_country_code: group.attrs.creator_country_code,
        desc,
        descId,
        descOwner,
        descOwnerPn,
        descTime,
        linkedParent: getBinaryNodeChild(group, 'linked_parent')?.attrs.jid || undefined,
        restrict: !!getBinaryNodeChild(group, 'locked'),
        announce: !!getBinaryNodeChild(group, 'announcement'),
        isCommunity: !!getBinaryNodeChild(group, 'parent'),
        isCommunityAnnounce: !!getBinaryNodeChild(group, 'default_sub_group'),
        joinApprovalMode: !!getBinaryNodeChild(group, 'membership_approval_mode'),
        memberAddMode,
        participants: getBinaryNodeChildren(group, 'participant').map(({ attrs }) => {
            const isLid = isLidUser(attrs.jid);
            const pn = attrs.phone_number;
            const hasPn = isPnUser(pn);
            // Jika grup pakai LID addressing:
            // - id   → pakai phoneNumber (PN) agar bisa dicompare dengan m.sender
            // - lid  → simpan LID asli
            // Jika grup pakai PN addressing: id tetap PN
            return {
                id: isLid && hasPn ? pn : attrs.jid,
                phoneNumber: isLid && hasPn ? pn : undefined,
                lid: isLid ? attrs.jid : (isPnUser(attrs.jid) && isLidUser(attrs.lid) ? attrs.lid : undefined),
                admin: (attrs.type || null)
            };
        }),
        ephemeralDuration: eph ? +eph : undefined
    };
    return metadata;
};
//# sourceMappingURL=groups.js.map
