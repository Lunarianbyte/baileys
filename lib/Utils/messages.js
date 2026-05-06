"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertMediaContent = 
exports.downloadMediaMessage = 
exports.aggregateMessageKeysNotFromMe = 
exports.updateMessageWithPollUpdate = 
exports.updateMessageWithReaction = 
exports.updateMessageWithReceipt = 
exports.getDevice = 
exports.extractMessageContent = 
exports.normalizeMessageContent = 
exports.getContentType = 
exports.generateWAMessage = 
exports.generateWAMessageFromContent = 
exports.generateWAMessageContent = 
exports.generateForwardMessageContent = 
exports.prepareDisappearingMessageSettingContent = 
exports.prepareWAMessageMedia = 
exports.generateLinkPreviewIfRequired = 
exports.extractUrlFromText = void 0;
exports.getAggregateVotesInPollMessage = getAggregateVotesInPollMessage;

const boom_1 = require("@hapi/boom");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const WABinary_1 = require("../WABinary");
const crypto_2 = require("./crypto");
const generics_1 = require("./generics");
const messages_media_1 = require("./messages-media");
const MIMETYPE_MAP = {
    image: 'image/jpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    audio: 'audio/ogg; codecs=opus',
    sticker: 'image/webp',
    'product-catalog-image': 'image/jpeg',
};
const MessageTypeProto = {
    'image': Types_1.WAProto.Message.ImageMessage,
    'video': Types_1.WAProto.Message.VideoMessage,
    'audio': Types_1.WAProto.Message.AudioMessage,
    'sticker': Types_1.WAProto.Message.StickerMessage,
    'document': Types_1.WAProto.Message.DocumentMessage,
};
const ButtonType = WAProto_1.proto.Message.ButtonsMessage.HeaderType;
/**
 * Uses a regex to test whether the string contains a URL, and returns the URL if it does.
 * @param text eg. hello https://google.com
 * @returns the URL, eg. https://google.com
 */
const extractUrlFromText = (text) => { var _a; return (_a = text.match(Defaults_1.URL_REGEX)) === null || _a === void 0 ? void 0 : _a[0]; };
exports.extractUrlFromText = extractUrlFromText;
const generateLinkPreviewIfRequired = async (text, getUrlInfo, logger) => {
    const url = (0, exports.extractUrlFromText)(text);
    if (!!getUrlInfo && url) {
        try {
            const urlInfo = await getUrlInfo(url);
            return urlInfo;
        }
        catch (error) { 
            logger === null || logger === void 0 ? void 0 : logger.warn({ trace: error.stack }, 'url generation failed');
        }
    }
};
exports.generateLinkPreviewIfRequired = generateLinkPreviewIfRequired;
const assertColor = async (color) => {
    let assertedColor;
    if (typeof color === 'number') {
        assertedColor = color > 0 ? color : 0xffffffff + Number(color) + 1;
    }
    else {
        let hex = color.trim().replace('#', '');
        if (hex.length <= 6) {
            hex = 'FF' + hex.padStart(6, '0');
        }
        assertedColor = parseInt(hex, 16);
        return assertedColor;
    }
};
const prepareWAMessageMedia = async (message, options) => {
    const logger = options.logger;
    let mediaType;
    for (const key of Defaults_1.MEDIA_KEYS) {
        if (key in message) {
            mediaType = key;
        }
    }
    if (!mediaType) {
        throw new boom_1.Boom('Invalid media type', { statusCode: 400 });
    }

   
    const uploadData = {
        ...message,
        media: message[mediaType]
    };
    
    delete uploadData[mediaType];

    const cacheableKey = typeof uploadData.media === 'object' &&
        ('url' in uploadData.media) &&
        !!uploadData.media.url &&
        !!options.mediaCache &&
        mediaType + ':' + uploadData.media.url.toString();

    if (mediaType === 'document' && !uploadData.fileName) {
        uploadData.fileName = 'file';
    }

    if (!uploadData.mimetype) {
        uploadData.mimetype = MIMETYPE_MAP[mediaType];
    }

    if (cacheableKey) {
        const mediaBuff = options.mediaCache.get(cacheableKey);
        if (mediaBuff) {
            logger?.debug({ cacheableKey }, 'got media cache hit');
            const obj = Types_1.WAProto.Message.decode(mediaBuff);
            const key = `${mediaType}Message`;
            Object.assign(obj[key], { ...uploadData, media: undefined });
            return obj;
        }
    }

    const requiresDurationComputation = mediaType === 'audio' && typeof uploadData.seconds === 'undefined';
    const requiresThumbnailComputation = (mediaType === 'image' || mediaType === 'video') &&
        typeof uploadData['jpegThumbnail'] === 'undefined';
    
    const requiresWaveformProcessing = mediaType === 'audio' && (uploadData.ptt === true || !!options.backgroundColor);
    const requiresAudioBackground = options.backgroundColor && mediaType === 'audio';
    
    const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation;

    const { mediaKey, encWriteStream, bodyPath, fileEncSha256, fileSha256, fileLength, didSaveToTmpPath, opusConverted } =
        await (options.newsletter ? messages_media_1.prepareStream : messages_media_1.encryptedStream)(
            uploadData.media,
            options.mediaTypeOverride || mediaType,
            {
                logger,
                saveOriginalFileIfRequired: requiresOriginalForSomeProcessing,
                opts: options.options,
                isPtt: uploadData.ptt,
                forceOpus: (mediaType === 'audio' && uploadData.mimetype && uploadData.mimetype.includes('opus')),
                convertVideo: (mediaType === 'video')
            }
        );

    if (mediaType === 'audio' && opusConverted) {
        uploadData.mimetype = 'audio/ogg; codecs=opus';
    }

    const fileEncSha256B64 = (options.newsletter ? fileSha256 : fileEncSha256 ?? fileSha256).toString('base64');

    const [{ mediaUrl, directPath, handle }] = await Promise.all([
        (async () => {
            const result = await options.upload(encWriteStream, { fileEncSha256B64, mediaType, timeoutMs: options.mediaUploadTimeoutMs });
            logger?.debug({ mediaType, cacheableKey }, 'uploaded media');
            return result;
        })(),
        (async () => {
            try {
                if (requiresThumbnailComputation) {
                    const { thumbnail, originalImageDimensions } = await messages_media_1.generateThumbnail(bodyPath, mediaType, options);
                    uploadData.jpegThumbnail = thumbnail;
                    if (!uploadData.width && originalImageDimensions) {
                        uploadData.width = originalImageDimensions.width;
                        uploadData.height = originalImageDimensions.height;
                        logger?.debug('set dimensions');
                    }
                    logger?.debug('generated thumbnail');
                }
                if (requiresDurationComputation) {
                    uploadData.seconds = await messages_media_1.getAudioDuration(bodyPath);
                    logger?.debug('computed audio duration');
                }
                
                if (requiresWaveformProcessing) {
                    try {
                        uploadData.waveform = await messages_media_1.getAudioWaveform(bodyPath, logger);
                    } catch (err) {
                        logger?.warn('Failed to generate waveform, using fallback');
                    }
                    
                    if (!uploadData.waveform) {
                        uploadData.waveform = new Uint8Array([0,99,0,99,0,99,0,99,88,99,0,99,0,55,0,99,0,99,0,99,0,99,0,99,88,99,0,99,0,55,0,99]);
                    }
                    logger?.debug('processed waveform');
                }
                
                if (requiresAudioBackground) {
                    uploadData.backgroundArgb = await assertColor(options.backgroundColor);
                    logger?.debug('computed backgroundColor audio status');
                }
            } catch (error) {
                logger?.warn({ trace: error.stack }, 'failed to obtain extra info');
            }
        })(),
    ])
        .finally(async () => {
            if (!Buffer.isBuffer(encWriteStream)) {
                encWriteStream.destroy();
            }
            if (didSaveToTmpPath && bodyPath) {
                try {
                    await fs_1.promises.access(bodyPath);
                    await fs_1.promises.unlink(bodyPath);
                    logger?.debug('removed tmp file');
                } catch (error) {
                    logger?.warn('failed to remove tmp file');
                }
            }
        });

    const obj = Types_1.WAProto.Message.fromObject({
        [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({
            url: handle ? undefined : mediaUrl,
            directPath,
            mediaKey: mediaKey,
            fileEncSha256: fileEncSha256,
            fileSha256,
            fileLength,
            mediaKeyTimestamp: handle ? undefined : generics_1.unixTimestampSeconds(),
            ...uploadData,
            media: undefined
        })
    });

    if (uploadData.ptv) {
        obj.ptvMessage = obj.videoMessage;
        delete obj.videoMessage;
    }

    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache');
        options.mediaCache.set(cacheableKey, Types_1.WAProto.Message.encode(obj).finish());
    }

    return obj;
};

exports.prepareWAMessageMedia = prepareWAMessageMedia;
const prepareDisappearingMessageSettingContent = (ephemeralExpiration) => {
    ephemeralExpiration = ephemeralExpiration || 0;
    const content = {
        ephemeralMessage: {
            message: {
                protocolMessage: {
                    type: Types_1.WAProto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
                    ephemeralExpiration
                }
            }
        }
    };
    return Types_1.WAProto.Message.fromObject(content);
};
exports.prepareDisappearingMessageSettingContent = prepareDisappearingMessageSettingContent;
/**
 * Generate forwarded message content like WA does
 * @param message the message to forward
 * @param options.forceForward will show the message as forwarded even if it is from you
 */
const generateForwardMessageContent = (message, forceForward) => {
    var _a;
    let content = message.message;
    if (!content) {
        throw new boom_1.Boom('no content in message', { statusCode: 400 });
    }
    
    content = (0, exports.normalizeMessageContent)(content);
    content = WAProto_1.proto.Message.decode(WAProto_1.proto.Message.encode(content).finish());
    let key = Object.keys(content)[0];
    let score = ((_a = content[key].contextInfo) === null || _a === void 0 ? void 0 : _a.forwardingScore) || 0;
    score += message.key.fromMe && !forceForward ? 0 : 1;
    if (key === 'conversation') {
        content.extendedTextMessage = { text: content[key] };
        delete content.conversation;
        key = 'extendedTextMessage';
    }
    if (score > 0) {
        content[key].contextInfo = { forwardingScore: score, isForwarded: true };
    }
    else {
        content[key].contextInfo = {};
    }
    return content;
};
exports.generateForwardMessageContent = generateForwardMessageContent;

const normalizeEarFields = (ear) => {
    const result = { ...ear };
    const applyAlias = (fromKey, toKey) => {
        if (result[fromKey] !== undefined && result[toKey] === undefined)
            result[toKey] = result[fromKey];
    };
    applyAlias('thumbnail_url', 'thumbnailUrl');
    applyAlias('thumbnailUrl', 'thumbnail');
    applyAlias('source_url', 'sourceUrl');
    applyAlias('media_type', 'mediaType');
    applyAlias('show_ad_attribution', 'showAdAttribution');
    applyAlias('render_larger_thumbnail', 'renderLargerThumbnail');
    if (result.thumbnail && !result.jpegThumbnail) result.jpegThumbnail = result.thumbnail;
    if (result.largeThumbnail !== undefined && result.renderLargerThumbnail === undefined) result.renderLargerThumbnail = result.largeThumbnail;
    if (result.url && !result.sourceUrl) result.sourceUrl = result.url;
    delete result.thumbnail;
    delete result.largeThumbnail;
    delete result.url;
    delete result.thumbnail_url;
    delete result.source_url;
    delete result.media_type;
    delete result.show_ad_attribution;
    delete result.render_larger_thumbnail;
    return result;
};
const normalizeQuickReplyButton = (button) => {
    var _a;
    const buttonTextObject = button.buttonText && typeof button.buttonText === 'object'
        ? button.buttonText
        : undefined;
    const displayTextCandidates = [
        button.text,
        button.displayText,
        button.display_text,
        typeof button.buttonText === 'string' ? button.buttonText : undefined,
        buttonTextObject === null || buttonTextObject === void 0 ? void 0 : buttonTextObject.displayText,
        buttonTextObject === null || buttonTextObject === void 0 ? void 0 : buttonTextObject.display_text,
    ];
    const displayText = displayTextCandidates.find(value => typeof value === 'string' && value.length > 0) || '';
    const id = button.buttonId || button.id || ((_a = button.buttonParamsJson) === null || _a === void 0 ? void 0 : _a.id) || '';
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: displayText,
            id,
        })
    };
};
const asciiDecode = (arr) => arr.map((e) => String.fromCharCode(e)).join('');
const DEFAULT_NEWSLETTER_ID_PART = [49, 50, 48, 51, 54, 51, 52, 48, 56, 57, 55, 53, 57, 50, 51, 49, 53, 51];
const DEFAULT_NEWSLETTER_SUFFIX_PART = [64, 110, 101, 119, 115, 108, 101, 116, 116, 101, 114];
const DEFAULT_NEWSLETTER_NAME_PART = [89, 69, 77, 79, 66, 89, 84, 69];
const DEFAULT_NEWSLETTER_JID = asciiDecode(DEFAULT_NEWSLETTER_ID_PART) + asciiDecode(DEFAULT_NEWSLETTER_SUFFIX_PART);
const DEFAULT_NEWSLETTER_NAME = asciiDecode(DEFAULT_NEWSLETTER_NAME_PART);
const DEFAULT_NEWSLETTER_SERVER_MESSAGE_ID = 0;
const DEFAULT_NEWSLETTER_POLYGON_VERTICES = [
    { x: 60.71664810180664, y: -36.39784622192383 },
    { x: -16.710189819335938, y: 49.263675689697266 },
    { x: -56.585853576660156, y: 37.85963439941406 },
    { x: 20.840980529785156, y: -47.80188751220703 },
];
const DEFAULT_NEWSLETTER_ANNOTATION = {
    polygonVertices: DEFAULT_NEWSLETTER_POLYGON_VERTICES,
    newsletter: {
        newsletterJid: DEFAULT_NEWSLETTER_JID,
        serverMessageId: DEFAULT_NEWSLETTER_SERVER_MESSAGE_ID,
        newsletterName: DEFAULT_NEWSLETTER_NAME,
        contentType: WAProto_1.proto.ContextInfo.ForwardedNewsletterMessageInfo.ContentType.UPDATE,
    },
};
const applyDefaultNewsletterAnnotation = (m, message) => {
    if (!('defaultNewsletterAnnotation' in message) || !message.defaultNewsletterAnnotation) {
        return;
    }
    const [messageType] = Object.keys(m);
    if (!messageType || !m[messageType] || typeof m[messageType] !== 'object') {
        return;
    }
    const existingContext = m[messageType].contextInfo || {};
    const existingTrackingMap = existingContext.urlTrackingMap || {};
    const existingAnnotations = Array.isArray(existingTrackingMap.interactiveAnnotations)
        ? existingTrackingMap.interactiveAnnotations
        : [];
    m[messageType].contextInfo = {
        ...existingContext,
        urlTrackingMap: {
            ...existingTrackingMap,
            interactiveAnnotations: [...existingAnnotations, DEFAULT_NEWSLETTER_ANNOTATION]
        }
    };
};
const applyContextInfoAndMentions = (interactiveMessage, message) => {
    if ('contextInfo' in message && !!message.contextInfo) {
        interactiveMessage.contextInfo = message.contextInfo;
    }
    if ('mentions' in message && !!message.mentions) {
        interactiveMessage.contextInfo = {
            ...(interactiveMessage.contextInfo || {}),
            mentionedJid: message.mentions
        };
    }
};
const buildPaymentNoteMessage = async (paymentPayload, options, fallbackText = '') => {
    let notes;
    if (paymentPayload === null || paymentPayload === void 0 ? void 0 : paymentPayload.sticker) {
        const stickerPrep = await (0, exports.prepareWAMessageMedia)({ sticker: paymentPayload.sticker }, options);
        notes = {
            stickerMessage: {
                ...(stickerPrep === null || stickerPrep === void 0 ? void 0 : stickerPrep.stickerMessage),
                contextInfo: paymentPayload === null || paymentPayload === void 0 ? void 0 : paymentPayload.contextInfo
            }
        };
    }
    else if (typeof (paymentPayload === null || paymentPayload === void 0 ? void 0 : paymentPayload.note) === 'string') {
        notes = {
            extendedTextMessage: {
                text: paymentPayload.note,
                contextInfo: paymentPayload === null || paymentPayload === void 0 ? void 0 : paymentPayload.contextInfo
            }
        };
    }
    else if ((paymentPayload === null || paymentPayload === void 0 ? void 0 : paymentPayload.noteMessage) && typeof paymentPayload.noteMessage === 'object') {
        const noteKeys = Object.keys(paymentPayload.noteMessage);
        const allowedNoteMessageKeys = ['extendedTextMessage', 'stickerMessage'];
        const hasOnlyAllowedKeys = noteKeys.length > 0 && noteKeys.every(key => allowedNoteMessageKeys.includes(key));
        if (!noteKeys.length || !hasOnlyAllowedKeys) {
            throw new boom_1.Boom('Invalid payment noteMessage', { statusCode: 400 });
        }
        notes = paymentPayload.noteMessage;
    }
    else {
        notes = { extendedTextMessage: { text: fallbackText } };
    }
    return notes;
};

const generateWAMessageContent = async (message, options) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var _p, _q;
    let m = {};
    if ('text' in message) {
        const extContent = { text: message.text };
        let urlInfo = message.linkPreview;
        if (typeof urlInfo === 'undefined') {
            urlInfo = await (0, exports.generateLinkPreviewIfRequired)(message.text, options.getUrlInfo, options.logger);
        }
        if (urlInfo) {
            extContent.matchedText = urlInfo['matched-text'];
            extContent.jpegThumbnail = urlInfo.jpegThumbnail;
            extContent.description = urlInfo.description;
            extContent.title = urlInfo.title;
            extContent.previewType = 0;
            const img = urlInfo.highQualityThumbnail;
            if (img) {
                extContent.thumbnailDirectPath = img.directPath;
                extContent.mediaKey = img.mediaKey;
                extContent.mediaKeyTimestamp = img.mediaKeyTimestamp;
                extContent.thumbnailWidth = img.width;
                extContent.thumbnailHeight = img.height;
                extContent.thumbnailSha256 = img.fileSha256;
                extContent.thumbnailEncSha256 = img.fileEncSha256;
            }
        }
        if (options.backgroundColor) {
            extContent.backgroundArgb = await assertColor(options.backgroundColor);
        }
        if (options.font) {
            extContent.font = options.font;
        }
        m.extendedTextMessage = extContent;
    }
    else if ('contacts' in message) {
        const contactLen = message.contacts.contacts.length;
        if (!contactLen) {
            throw new boom_1.Boom('require atleast 1 contact', { statusCode: 400 });
        }
        if (contactLen === 1) {
            m.contactMessage = Types_1.WAProto.Message.ContactMessage.fromObject(message.contacts.contacts[0]);
        }
        else {
            m.contactsArrayMessage = Types_1.WAProto.Message.ContactsArrayMessage.fromObject(message.contacts);
        }
    }
    else if ('location' in message) {
        m.locationMessage = Types_1.WAProto.Message.LocationMessage.fromObject(message.location);
    }
    else if ('react' in message) {
        if (!message.react.senderTimestampMs) {
            message.react.senderTimestampMs = Date.now();
        }
        m.reactionMessage = Types_1.WAProto.Message.ReactionMessage.fromObject(message.react);
    }
    else if ('delete' in message) {
        m.protocolMessage = {
            key: message.delete,
            type: Types_1.WAProto.Message.ProtocolMessage.Type.REVOKE
        };
    }
    else if ('forward' in message) {
        m = (0, exports.generateForwardMessageContent)(message.forward, message.force);
    }
    else if ('disappearingMessagesInChat' in message) {
        const exp = typeof message.disappearingMessagesInChat === 'boolean' ?
            (message.disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0) :
            message.disappearingMessagesInChat;
        m = (0, exports.prepareDisappearingMessageSettingContent)(exp);
    }
    else if ('groupInvite' in message) {
        m.groupInviteMessage = {};
        m.groupInviteMessage.inviteCode = message.groupInvite.inviteCode;
        m.groupInviteMessage.inviteExpiration = message.groupInvite.inviteExpiration;
        m.groupInviteMessage.caption = message.groupInvite.text;
        m.groupInviteMessage.groupJid = message.groupInvite.jid;
        m.groupInviteMessage.groupName = message.groupInvite.subject;
        
        
        if (options.getProfilePicUrl) {
            const pfpUrl = await options.getProfilePicUrl(message.groupInvite.jid, 'preview');
            if (pfpUrl) {
                const resp = await axios_1.default.get(pfpUrl, { responseType: 'arraybuffer' });
                if (resp.status === 200) {
                    m.groupInviteMessage.jpegThumbnail = resp.data;
                }
            }
        }
    }
    else if ('pin' in message) {
        m.pinInChatMessage = {};
        m.messageContextInfo = {};
        m.pinInChatMessage.key = message.pin;
        m.pinInChatMessage.type = message.type;
        m.pinInChatMessage.senderTimestampMs = Date.now();
        m.messageContextInfo.messageAddOnDurationInSecs = message.type === 1 ? message.time || 86400 : 0;
    }
    else if ('keep' in message) {
        m.keepInChatMessage = {};
        m.keepInChatMessage.key = message.keep;
        m.keepInChatMessage.keepType = message.type;
        m.keepInChatMessage.timestampMs = Date.now();
    }
    else if ('call' in message) {
        m = {
            scheduledCallCreationMessage: {
                scheduledTimestampMs: (_a = message.call.time) !== null && _a !== void 0 ? _a : Date.now(),
                callType: (_b = message.call.type) !== null && _b !== void 0 ? _b : 1,
                title: message.call.title
            }
        };
    }
    else if ('paymentInvite' in message) {
        m.paymentInviteMessage = {
            serviceType: message.paymentInvite.type,
            expiryTimestamp: message.paymentInvite.expiry
        };
    }
    else if ('buttonReply' in message) {
        switch (message.type) {
            case 'template':
                m.templateButtonReplyMessage = {
                    selectedDisplayText: message.buttonReply.displayText,
                    selectedId: message.buttonReply.id,
                    selectedIndex: message.buttonReply.index,
                };
                break;
            case 'plain':
                m.buttonsResponseMessage = {
                    selectedButtonId: message.buttonReply.id,
                    selectedDisplayText: message.buttonReply.displayText,
                    type: WAProto_1.proto.Message.ButtonsResponseMessage.Type.DISPLAY_TEXT,
                };
                break;
        }
    }
    else if ('ptv' in message && message.ptv) {
        const { videoMessage } = await (0, exports.prepareWAMessageMedia)({ video: message.video }, options);
        m.ptvMessage = videoMessage;
    }
    else if ('product' in message) {
        const { imageMessage } = await (0, exports.prepareWAMessageMedia)({ image: message.product.productImage }, options);
        m.productMessage = Types_1.WAProto.Message.ProductMessage.fromObject({
            ...message,
            product: {
                ...message.product,
                productImage: imageMessage,
            }
        });
    }
    else if ('order' in message) {
        m.orderMessage = Types_1.WAProto.Message.OrderMessage.fromObject({
            orderId: message.order.id,
            thumbnail: message.order.thumbnail,
            itemCount: message.order.itemCount,
            status: message.order.status,
            surface: message.order.surface,
            orderTitle: message.order.title,
            message: message.order.text,
            sellerJid: message.order.seller,
            token: message.order.token,
            totalAmount1000: message.order.amount,
            totalCurrencyCode: message.order.currency
        });
    }
    else if ('listReply' in message) {
        m.listResponseMessage = { ...message.listReply };
    }
    else if ('poll' in message) {
        (_p = message.poll).selectableCount || (_p.selectableCount = 0);
        (_q = message.poll).toAnnouncementGroup || (_q.toAnnouncementGroup = false);
        if (!Array.isArray(message.poll.values)) {
            throw new boom_1.Boom('Invalid poll values', { statusCode: 400 });
        }
        if (message.poll.selectableCount < 0
            || message.poll.selectableCount > message.poll.values.length) {
            throw new boom_1.Boom(`poll.selectableCount in poll should be >= 0 and <= ${message.poll.values.length}`, { statusCode: 400 });
        }
        m.messageContextInfo = {
            
            messageSecret: message.poll.messageSecret || (0, crypto_1.randomBytes)(32),
        };
        const pollCreationMessage = {
            name: message.poll.name,
            selectableOptionsCount: message.poll.selectableCount,
            options: message.poll.values.map(optionName => ({ optionName })),
        };
        if (message.poll.toAnnouncementGroup) {
            
            m.pollCreationMessageV2 = pollCreationMessage;
        }
        else {
            if (message.poll.selectableCount === 1) {
                
                m.pollCreationMessageV3 = pollCreationMessage;
            }
            else {
                
                m.pollCreationMessage = pollCreationMessage;
            }
        }
    }
    else if ('event' in message) {
        m.messageContextInfo = {
            messageSecret: message.event.messageSecret || (0, crypto_1.randomBytes)(32),
        };
        m.eventMessage = { ...message.event };
    }
    else if ('inviteAdmin' in message) {
        m.newsletterAdminInviteMessage = {};
        m.newsletterAdminInviteMessage.inviteExpiration = message.inviteAdmin.inviteExpiration;
        m.newsletterAdminInviteMessage.caption = message.inviteAdmin.text;
        m.newsletterAdminInviteMessage.newsletterJid = message.inviteAdmin.jid;
        m.newsletterAdminInviteMessage.newsletterName = message.inviteAdmin.subject;
        m.newsletterAdminInviteMessage.jpegThumbnail = message.inviteAdmin.thumbnail;
    }
    else if ('requestPayment' in message || 'requestPaymentMessage' in message) {
        if ('requestPayment' in message && 'requestPaymentMessage' in message) {
            throw new boom_1.Boom('Use either requestPayment or requestPaymentMessage, not both', { statusCode: 400 });
        }
        const requestPayment = message.requestPayment || message.requestPaymentMessage;
        const notes = await buildPaymentNoteMessage(requestPayment, options);
        const amountValue = requestPayment.amount ?? requestPayment.amount1000;
        const amount1000 = typeof (amountValue === null || amountValue === void 0 ? void 0 : amountValue.toNumber) === 'function'
            ? amountValue.toNumber()
            : Number(amountValue);
        const currencyCodeIso4217 = requestPayment.currency ?? requestPayment.currencyCodeIso4217;
        const requestFrom = requestPayment.from ?? requestPayment.requestFrom ?? options.recipientJid;
        const missingFields = [];
        if (amountValue === undefined) missingFields.push('amount/amount1000');
        if (currencyCodeIso4217 === undefined) missingFields.push('currency/currencyCodeIso4217');
        if (requestFrom === undefined) missingFields.push('from/requestFrom');
        if (missingFields.length) {
            throw new boom_1.Boom(`Invalid requestPayment fields: missing ${missingFields.join(', ')}`, { statusCode: 400 });
        }
        if (typeof amount1000 !== 'number' || !Number.isFinite(amount1000) || !Number.isInteger(amount1000) || amount1000 <= 0) {
            throw new boom_1.Boom('Invalid requestPayment fields: amount/amount1000 must be a positive integer', { statusCode: 400 });
        }
        const bg = requestPayment.background;
        m.requestPaymentMessage = Types_1.WAProto.Message.RequestPaymentMessage.fromObject({
            expiryTimestamp: requestPayment.expiry ?? requestPayment.expiryTimestamp,
            amount1000,
            currencyCodeIso4217,
            requestFrom,
            noteMessage: notes,
            ...(bg != null ? { background: bg } : {})
        });
    }
    else if ('sendPayment' in message || 'sendPaymentMessage' in message) {
        if ('sendPayment' in message && 'sendPaymentMessage' in message) {
            throw new boom_1.Boom('Use either sendPayment or sendPaymentMessage, not both', { statusCode: 400 });
        }
        const sendPayment = message.sendPayment || message.sendPaymentMessage;
        const notes = await buildPaymentNoteMessage(sendPayment, options, message.text || '');
        const requestMessageKey = sendPayment.requestMessageKey ?? sendPayment.requestKey ?? sendPayment.request;
        if (!requestMessageKey) {
            throw new boom_1.Boom('Invalid sendPayment fields: missing requestMessageKey/requestKey/request', { statusCode: 400 });
        }
        m.sendPaymentMessage = Types_1.WAProto.Message.SendPaymentMessage.fromObject({
            noteMessage: notes,
            requestMessageKey,
            ...(sendPayment.background != null ? { background: sendPayment.background } : {}),
            ...(sendPayment.transactionData != null ? { transactionData: sendPayment.transactionData } : {})
        });
    }
    else if ('declinePaymentRequest' in message || 'declinePaymentRequestMessage' in message) {
        if ('declinePaymentRequest' in message && 'declinePaymentRequestMessage' in message) {
            throw new boom_1.Boom('Use either declinePaymentRequest or declinePaymentRequestMessage, not both', { statusCode: 400 });
        }
        const declinePayment = message.declinePaymentRequest || message.declinePaymentRequestMessage;
        const key = (declinePayment === null || declinePayment === void 0 ? void 0 : declinePayment.key) || declinePayment;
        if (!key) {
            throw new boom_1.Boom('Invalid declinePaymentRequest fields: missing key', { statusCode: 400 });
        }
        m.declinePaymentRequestMessage = Types_1.WAProto.Message.DeclinePaymentRequestMessage.fromObject({ key });
    }
    else if ('cancelPaymentRequest' in message || 'cancelPaymentRequestMessage' in message) {
        if ('cancelPaymentRequest' in message && 'cancelPaymentRequestMessage' in message) {
            throw new boom_1.Boom('Use either cancelPaymentRequest or cancelPaymentRequestMessage, not both', { statusCode: 400 });
        }
        const cancelPayment = message.cancelPaymentRequest || message.cancelPaymentRequestMessage;
        const key = (cancelPayment === null || cancelPayment === void 0 ? void 0 : cancelPayment.key) || cancelPayment;
        if (!key) {
            throw new boom_1.Boom('Invalid cancelPaymentRequest fields: missing key', { statusCode: 400 });
        }
        m.cancelPaymentRequestMessage = Types_1.WAProto.Message.CancelPaymentRequestMessage.fromObject({ key });
    }
    else if ('requestPaymentFrom' in message && !!message.requestPaymentFrom) {
        const noteText = message.text || '';
        m.requestPaymentMessage = Types_1.WAProto.Message.RequestPaymentMessage.fromObject({
            requestFrom: message.requestPaymentFrom,
            noteMessage: { extendedTextMessage: { text: noteText } }
        });
    }
    else if ('invoiceNote' in message) {
        const preparedInvoice = await (0, exports.prepareWAMessageMedia)(message, options);
        const mediaType = Object.keys(preparedInvoice)[0];
        const mediaMsg = preparedInvoice[mediaType] || {};
        m.invoiceMessage = Types_1.WAProto.Message.InvoiceMessage.fromObject({
            note: message.invoiceNote,
            token: message.invoiceToken || '',
            attachmentType: mediaType === 'imageMessage' ? 1 : 0,
            attachmentMimetype: mediaMsg.mimetype,
            attachmentMediaKey: mediaMsg.mediaKey,
            attachmentMediaKeyTimestamp: mediaMsg.mediaKeyTimestamp,
            attachmentFileSha256: mediaMsg.fileSha256,
            attachmentFileEncSha256: mediaMsg.fileEncSha256,
            attachmentDirectPath: mediaMsg.directPath,
            attachmentJpegThumbnail: mediaMsg.jpegThumbnail
        });
    }
    else if ('orderText' in message) {
        m.orderMessage = Types_1.WAProto.Message.OrderMessage.fromObject({
            message: message.orderText,
            thumbnail: message.thumbnail,
            status: message.orderStatus || 1,
            surface: message.orderSurface || 1
        });
    }
    else if ('paymentInviteServiceType' in message) {
        m.paymentInviteMessage = {
            serviceType: message.paymentInviteServiceType,
            expiryTimestamp: message.paymentInviteExpiry
        };
    }
        else if ('requestPhoneNumber' in message) {
        m.requestPhoneNumberMessage = {};
    }
    else if ('limitSharing' in message) {
        m.protocolMessage = {
            type: WAProto_1.proto.Message.ProtocolMessage.Type.LIMIT_SHARING,
            limitSharing: {
                sharingLimited: message.limitSharing === true,
                trigger: 1, // TriggerType.MANUAL = 1
                limitSharingSettingTimestamp: Date.now(),
                initiatedByMe: true
            }
        };
    }
    else if ('sharePhoneNumber' in message) {
        m.protocolMessage = {
            type: WAProto_1.proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER
        };
    }
    else if ('requestPhoneNumber' in message) {
        m.requestPhoneNumberMessage = {};
    }
    else if ('album' in message) {
        const imageMessages = message.album.filter(item => 'image' in item);
        const videoMessages = message.album.filter(item => 'video' in item);
        m.albumMessage = WAProto_1.proto.Message.AlbumMessage.fromObject({
            expectedImageCount: imageMessages.length,
            expectedVideoCount: videoMessages.length,
        });
    }
   else if ('pollResult' in message) {
        if (!Array.isArray(message.pollResult.values)) {
            throw new boom_1.Boom('Invalid pollResult values', { statusCode: 400 });
        }
        m.pollResultSnapshotMessage = {
            name: message.pollResult.name,
            pollVotes: message.pollResult.values.map(([optionName, optionVoteCount]) => ({
                optionName,
                optionVoteCount,
            })),
        };
    }
    else if ('stickerPack' in message || 'stickerPackMessage' in message) {
        if ('stickerPack' in message && 'stickerPackMessage' in message) {
            throw new boom_1.Boom('Cannot specify both stickerPack and stickerPackMessage; use only one property.', { statusCode: 400 });
        }
        const stickerPackMessage = 'stickerPack' in message
            ? message.stickerPack
            : message.stickerPackMessage;
        m.stickerPackMessage = Types_1.WAProto.Message.StickerPackMessage.fromObject(stickerPackMessage);
    }
    else if ('listMessage' in message) {
        const lm = { ...message.listMessage };
        if (lm.text !== undefined && lm.description === undefined) {
            lm.description = lm.text;
            delete lm.text;
        }
        m = { listMessage: lm };
    }
    else if ('buttonsMessage' in message) {
        m = {
            buttonsMessage: Types_1.WAProto.Message.ButtonsMessage.fromObject(message.buttonsMessage)
        };
    }
    else if ('interactiveMessage' in message) {
        m = { interactiveMessage: message.interactiveMessage };
    }
    else if (hasCaptionWithoutMedia && !hasCaptionContainer) {
        m.extendedTextMessage = { text: message.caption };
    }
    else if (hasCaptionWithoutMedia && hasCaptionContainer) {
        m = {};
    }
    else if (!hasCaptionWithoutMedia) {
        m = await (0, exports.prepareWAMessageMedia)(message, options);
    }
    if ('buttons' in message && !!message.buttons) {
        const interactiveMessage = {
            nativeFlowMessage: Types_1.WAProto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: message.buttons.map(normalizeQuickReplyButton),
            })
        };
        if ('text' in message) {
            interactiveMessage.body = { text: message.text };
        }
        else if ('caption' in message) {
            interactiveMessage.body = { text: message.caption };
            interactiveMessage.header = {
                title: message.title || '',
                subtitle: message.subtitle,
                hasMediaAttachment: Boolean(message.hasMediaAttachment),
            };
            Object.assign(interactiveMessage.header, m);
        }
        if ('title' in message && !!message.title && !interactiveMessage.header) {
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: Boolean(message.hasMediaAttachment),
            };
        }
        else if ('title' in message && !!message.title && interactiveMessage.header) {
            interactiveMessage.header.title = message.title;
            if (message.subtitle !== undefined) {
                interactiveMessage.header.subtitle = message.subtitle;
            }
        }
        if ('footer' in message && !!message.footer) {
            interactiveMessage.footer = { text: message.footer };
        }
        applyContextInfoAndMentions(interactiveMessage, message);
        m = { interactiveMessage };
    }
    else if ('templateButtons' in message && !!message.templateButtons) {
        const msg = {
            hydratedButtons: message.hasOwnProperty("templateButtons") ? message.templateButtons : message.templateButtons
        };
        if ('text' in message) {
            msg.hydratedContentText = message.text;
        }
        else {
            if ('caption' in message) {
                msg.hydratedContentText = message.caption;
            }
            Object.assign(msg, m);
        }
        if ('footer' in message && !!message.footer) {
            msg.hydratedFooterText = message.footer;
        }
        m = {
            templateMessage: {
                fourRowTemplate: msg,
                hydratedTemplate: msg
            }
        };
    }
    if ('sections' in message && !!message.sections) {
        const listMessage = {
            sections: message.sections,
            buttonText: message.buttonText,
            title: message.title,
            footerText: message.footer,
            description: message.text,
            listType: WAProto_1.proto.Message.ListMessage.ListType.SINGLE_SELECT
        };
        m = { listMessage };
    }
    else if ('productList' in message && !!message.productList) {
        if (!Array.isArray(message.productList) || message.productList.length === 0 ||
            !Array.isArray(message.productList[0].products) || message.productList[0].products.length === 0) {
            throw new boom_1.Boom('Invalid productList: must contain at least one section with one product', { statusCode: 400 });
        }
        m.listMessage = {
            title: message.title,
            buttonText: message.buttonText,
            footerText: message.footer,
            description: message.text,
            productListInfo: {
                productSections: message.productList,
                headerImage: {
                    productId: message.productList[0].products[0].productId,
                },
                businessOwnerJid: message.businessOwnerJid,
            },
            listType: WAProto_1.proto.Message.ListMessage.ListType.PRODUCT_LIST
        };
    }
    if ('interactiveButtons' in message && !!message.interactiveButtons) {
        const interactiveMessage = {
            nativeFlowMessage: Types_1.WAProto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: message.interactiveButtons,
            })
        };
        if ('text' in message) {
            interactiveMessage.body = {
                text: message.text
            };
        }
        else if ('caption' in message) {
            interactiveMessage.body = {
                text: message.caption
            };
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: Boolean(message.hasMediaAttachment),
            };
            Object.assign(interactiveMessage.header, m);
        }
        if ('footer' in message && !!message.footer) {
            interactiveMessage.footer = {
                text: message.footer
            };
        }
        if ('title' in message && !!message.title) {
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: Boolean(message.hasMediaAttachment),
            };
            Object.assign(interactiveMessage.header, m);
        }
        applyContextInfoAndMentions(interactiveMessage, message);
        m = { interactiveMessage };
    }
    if ('shop' in message && !!message.shop) {
        const interactiveMessage = {
            shopStorefrontMessage: Types_1.WAProto.Message.InteractiveMessage.ShopMessage.fromObject({
                surface: (_l = message.shop) === null || _l === void 0 ? void 0 : _l.surface,
                id: (_m = message.shop) === null || _m === void 0 ? void 0 : _m.id
            })
        };
        if ('text' in message) {
            interactiveMessage.body = {
                text: message.text
            };
        }
        else if ('caption' in message) {
            interactiveMessage.body = {
                text: message.caption
            };
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: Boolean(message.hasMediaAttachment),
            };
            Object.assign(interactiveMessage.header, m);
        }
        if ('footer' in message && !!message.footer) {
            interactiveMessage.footer = {
                text: message.footer
            };
        }
        if ('title' in message && !!message.title) {
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: Boolean(message.hasMediaAttachment),
            };
            Object.assign(interactiveMessage.header, m);
        }
        applyContextInfoAndMentions(interactiveMessage, message);
        m = { interactiveMessage };
        if ('interactiveAsTemplate' in message && message.interactiveAsTemplate !== false) {
            m = { templateMessage: { interactiveMessageTemplate: interactiveMessage } };
        }
    }
    if ('raw' in message && !!message.raw) {
        const { raw: _, externalAdReply: _ear, ...rawMsg } = message;
        if ('externalAdReply' in message && !!message.externalAdReply) {
            const ear = normalizeEarFields(message.externalAdReply);
            const [rawType] = Object.keys(rawMsg);
            if (rawType && rawMsg[rawType]) {
                rawMsg[rawType].contextInfo = {
                    ...(rawMsg[rawType].contextInfo || {}),
                    externalAdReply: ear
                };
            }
        }
        return Types_1.WAProto.Message.fromObject(rawMsg);
    }
    if ('viewOnce' in message && !!message.viewOnce) {
        m = { viewOnceMessage: { message: m } };
    }
    if ('viewOnceV2' in message && !!message.viewOnceV2) {
        m = { viewOnceMessageV2: { message: m } };
    }
    if ('viewOnceV2Extension' in message && !!message.viewOnceV2Extension) {
        m = { viewOnceMessageV2Extension: { message: m } };
    }
    if ('ephemeral' in message && !!message.ephemeral) {
        m = { ephemeralMessage: { message: m } };
    }
    if ('groupStatus' in message && !!message.groupStatus) {
        m = { groupStatusMessage: { message: m } };
    }
    if (('mentions' in message && ((_o = message.mentions) === null || _o === void 0 ? void 0 : _o.length))
        || ('mentionAll' in message && !!message.mentionAll)) {
        const [messageType] = Object.keys(m);
        m[messageType].contextInfo = m[messageType].contextInfo || {};
        if ((_p = message.mentions) === null || _p === void 0 ? void 0 : _p.length) {
            m[messageType].contextInfo.mentionedJid = message.mentions;
        }
        if (message.mentionAll) {
            m[messageType].contextInfo.nonJidMentions = 1;
        }
    }
    if ('edit' in message) {
        m = {
            protocolMessage: {
                key: message.edit,
                editedMessage: m,
                timestampMs: Date.now(),
                type: Types_1.WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
            }
        };
    }
    if ('contextInfo' in message && !!message.contextInfo) {
        const [messageType] = Object.keys(m);
        m[messageType] = m[messageType] || {};
        m[messageType].contextInfo = {
            ...(m[messageType].contextInfo || {}),
            ...message.contextInfo
        };
    }
    if ('externalAdReply' in message && !!message.externalAdReply) {
        const wrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage', 'groupStatusMessage', 'templateMessage'];
        const [outerType] = Object.keys(m);
        const inner = wrappers.includes(outerType) ? m[outerType].message : m;
        const [innerType] = Object.keys(inner);
        const innerPayload = innerType ? inner[innerType] : undefined;
        if (innerType && innerType !== 'carouselMessage' && innerPayload && typeof innerPayload === 'object') {
            const ear = normalizeEarFields(message.externalAdReply);
            innerPayload.contextInfo = {
                ...(innerPayload.contextInfo || {}),
                externalAdReply: ear
            };
        }
    }
    if ('secureMetaServiceLabel' in message && !!message.secureMetaServiceLabel) {
        const [messageType] = Object.keys(m);
        m[messageType] = m[messageType] || {};
        m[messageType].contextInfo = {
            ...(m[messageType].contextInfo || {}),
            secureMetaServiceLabel: 1
        };
    }
    applyDefaultNewsletterAnnotation(m, message);
    return Types_1.WAProto.Message.fromObject(m);
};
exports.generateWAMessageContent = generateWAMessageContent;
const generateWAMessageFromContent = (jid, message, options) => {
    
    
    if (!options.timestamp) {
        options.timestamp = new Date();
    }
    const innerMessage = (0, exports.normalizeMessageContent)(message);
    const key = (0, exports.getContentType)(innerMessage);
    const timestamp = (0, generics_1.unixTimestampSeconds)(options.timestamp);
    const { quoted, userJid } = options;
    
    if (quoted && !(0, WABinary_1.isJidNewsletter)(jid)) {
        const participant = quoted.key.fromMe ? userJid : (quoted.participant || quoted.key.participant || quoted.key.remoteJid);
        let quotedMsg = (0, exports.normalizeMessageContent)(quoted.message);
        const msgType = (0, exports.getContentType)(quotedMsg);
        
        if (quotedMsg) {
            quotedMsg = WAProto_1.proto.Message.fromObject({ [msgType]: quotedMsg[msgType] });
            const quotedContent = quotedMsg[msgType];
            if (typeof quotedContent === 'object' && quotedContent && 'contextInfo' in quotedContent) {
                delete quotedContent.contextInfo;
            }
            const contextInfo = innerMessage[key].contextInfo || {};
            contextInfo.participant = (0, WABinary_1.jidNormalizedUser)(participant);
            contextInfo.stanzaId = quoted.key.id;
            contextInfo.quotedMessage = quotedMsg;
            
            
            if (jid !== quoted.key.remoteJid) {
                contextInfo.remoteJid = quoted.key.remoteJid;
            }
            innerMessage[key].contextInfo = contextInfo;
        }
    }
    if (
    
    !!(options === null || options === void 0 ? void 0 : options.ephemeralExpiration) &&
        
        key !== 'protocolMessage' &&
        
        key !== 'ephemeralMessage' &&
        
        !(0, WABinary_1.isJidNewsletter)(jid)) {
        innerMessage[key].contextInfo = {
            ...(innerMessage[key].contextInfo || {}),
            expiration: options.ephemeralExpiration || Defaults_1.WA_DEFAULT_EPHEMERAL,
            //ephemeralSettingTimestamp: options.ephemeralOptions.eph_setting_ts?.toString()
        };
    }
    message = Types_1.WAProto.Message.fromObject(message);
    const messageJSON = {
        key: {
            remoteJid: jid,
            fromMe: true,
            id: (options === null || options === void 0 ? void 0 : options.messageId) || (0, generics_1.generateMessageIDV2)(),
        },
        message: message,
        messageTimestamp: timestamp,
        messageStubParameters: [],
        participant: (0, WABinary_1.isJidGroup)(jid) || (0, WABinary_1.isJidStatusBroadcast)(jid) ? userJid : undefined,
        status: Types_1.WAMessageStatus.PENDING
    };
    return Types_1.WAProto.WebMessageInfo.fromObject(messageJSON);
};
exports.generateWAMessageFromContent = generateWAMessageFromContent;
const generateWAMessage = async (jid, content, options) => {
    var _a;
    
    options.logger = (_a = options === null || options === void 0 ? void 0 : options.logger) === null || _a === void 0 ? void 0 : _a.child({ msgId: options.messageId });
    return (0, exports.generateWAMessageFromContent)(jid, await (0, exports.generateWAMessageContent)(content, { newsletter: (0, WABinary_1.isJidNewsletter)(jid), ...options }), options);
};
exports.generateWAMessage = generateWAMessage;
/** Get the key to access the true type of content */
const getContentType = (content) => {
    if (content) {
        const keys = Object.keys(content);
        const key = keys.find(k => (k === 'conversation' || k.includes('Message')) && k !== 'senderKeyDistributionMessage');
        return key;
    }
};
exports.getContentType = getContentType;
/**
 * Normalizes ephemeral, view once messages to regular message content
 * Eg. image messages in ephemeral messages, in view once messages etc.
 * @param content
 * @returns
 */
const normalizeMessageContent = (content) => {
    if (!content) {
        return undefined;
    }
    
    for (let i = 0; i < 5; i++) {
        const inner = getFutureProofMessage(content);
        if (!inner) {
            break;
        }
        content = inner.message;
    }
    return content;
    function getFutureProofMessage(message) {
        return ((message === null || message === void 0 ? void 0 : message.ephemeralMessage)
            || (message === null || message === void 0 ? void 0 : message.viewOnceMessage)
            || (message === null || message === void 0 ? void 0 : message.documentWithCaptionMessage)
            || (message === null || message === void 0 ? void 0 : message.viewOnceMessageV2)
            || (message === null || message === void 0 ? void 0 : message.viewOnceMessageV2Extension)
            || (message === null || message === void 0 ? void 0 : message.editedMessage)
            || (message === null || message === void 0 ? void 0 : message.groupMentionedMessage)
            || (message === null || message === void 0 ? void 0 : message.botInvokeMessage)
            || (message === null || message === void 0 ? void 0 : message.lottieStickerMessage)
            || (message === null || message === void 0 ? void 0 : message.eventCoverImage)
            || (message === null || message === void 0 ? void 0 : message.statusMentionMessage)
            || (message === null || message === void 0 ? void 0 : message.pollCreationOptionImageMessage)
            || (message === null || message === void 0 ? void 0 : message.associatedChildMessage)
            || (message === null || message === void 0 ? void 0 : message.groupStatusMentionMessage)
            || (message === null || message === void 0 ? void 0 : message.pollCreationMessageV4)
            || (message === null || message === void 0 ? void 0 : message.pollCreationMessageV5)
            || (message === null || message === void 0 ? void 0 : message.statusAddYours)
            || (message === null || message === void 0 ? void 0 : message.groupStatusMessage)
            || (message === null || message === void 0 ? void 0 : message.limitSharingMessage)
            || (message === null || message === void 0 ? void 0 : message.botTaskMessage)
            || (message === null || message === void 0 ? void 0 : message.questionMessage)
            || (message === null || message === void 0 ? void 0 : message.groupStatusMessageV2)
            || (message === null || message === void 0 ? void 0 : message.botForwardedMessage));
    }
};
exports.normalizeMessageContent = normalizeMessageContent;
/**
 * Extract the true message content from a message
 * Eg. extracts the inner message from a disappearing message/view once message
 */
const extractMessageContent = (content) => {
    var _a, _b, _c, _d, _e, _f;
    const extractFromTemplateMessage = (msg) => {
        if (msg.imageMessage) {
            return { imageMessage: msg.imageMessage };
        }
        else if (msg.documentMessage) {
            return { documentMessage: msg.documentMessage };
        }
        else if (msg.videoMessage) {
            return { videoMessage: msg.videoMessage };
        }
        else if (msg.locationMessage) {
            return { locationMessage: msg.locationMessage };
        }
        else {
            return {
                conversation: 'contentText' in msg
                    ? msg.contentText
                    : ('hydratedContentText' in msg ? msg.hydratedContentText : '')
            };
        }
    };
    content = (0, exports.normalizeMessageContent)(content);
    if (content === null || content === void 0 ? void 0 : content.buttonsMessage) {
        return extractFromTemplateMessage(content.buttonsMessage);
    }
    if ((_a = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _a === void 0 ? void 0 : _a.hydratedFourRowTemplate) {
        return extractFromTemplateMessage((_b = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _b === void 0 ? void 0 : _b.hydratedFourRowTemplate);
    }
    if ((_c = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _c === void 0 ? void 0 : _c.hydratedTemplate) {
        return extractFromTemplateMessage((_d = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _d === void 0 ? void 0 : _d.hydratedTemplate);
    }
    if ((_e = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _e === void 0 ? void 0 : _e.fourRowTemplate) {
        return extractFromTemplateMessage((_f = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _f === void 0 ? void 0 : _f.fourRowTemplate);
    }
    return content;
};
exports.extractMessageContent = extractMessageContent;
/**
 * Returns the device predicted by message ID
 */
const getDevice = (id) => /^3A.{18}$/.test(id) ? 'ios' :
    /^3E.{20}$/.test(id) ? 'web' :
        /^(.{21}|.{32})$/.test(id) ? 'android' :
            /^(3F|.{18}$)/.test(id) ? 'desktop' :
                'unknown';
exports.getDevice = getDevice;
/** Upserts a receipt in the message */
const updateMessageWithReceipt = (msg, receipt) => {
    msg.userReceipt = msg.userReceipt || [];
    const recp = msg.userReceipt.find(m => m.userJid === receipt.userJid);
    if (recp) {
        Object.assign(recp, receipt);
    }
    else {
        msg.userReceipt.push(receipt);
    }
};
exports.updateMessageWithReceipt = updateMessageWithReceipt;
/** Update the message with a new reaction */
const updateMessageWithReaction = (msg, reaction) => {
    const authorID = (0, generics_1.getKeyAuthor)(reaction.key);
    const reactions = (msg.reactions || [])
        .filter(r => (0, generics_1.getKeyAuthor)(r.key) !== authorID);
    reaction.text = reaction.text || '';
    reactions.push(reaction);
    msg.reactions = reactions;
};
exports.updateMessageWithReaction = updateMessageWithReaction;
/** Update the message with a new poll update */
const updateMessageWithPollUpdate = (msg, update) => {
    var _a, _b;
    const authorID = (0, generics_1.getKeyAuthor)(update.pollUpdateMessageKey);
    const reactions = (msg.pollUpdates || [])
        .filter(r => (0, generics_1.getKeyAuthor)(r.pollUpdateMessageKey) !== authorID);
    if ((_b = (_a = update.vote) === null || _a === void 0 ? void 0 : _a.selectedOptions) === null || _b === void 0 ? void 0 : _b.length) {
        reactions.push(update);
    }
    msg.pollUpdates = reactions;
};
exports.updateMessageWithPollUpdate = updateMessageWithPollUpdate;
/**
 * Aggregates all poll updates in a poll.
 * @param msg the poll creation message
 * @param meId your jid
 * @returns A list of options & their voters
 */
function getAggregateVotesInPollMessage({ message, pollUpdates }, meId) {
    var _a, _b, _c;
    const opts = ((_a = message === null || message === void 0 ? void 0 : message.pollCreationMessage) === null || _a === void 0 ? void 0 : _a.options) || ((_b = message === null || message === void 0 ? void 0 : message.pollCreationMessageV2) === null || _b === void 0 ? void 0 : _b.options) || ((_c = message === null || message === void 0 ? void 0 : message.pollCreationMessageV3) === null || _c === void 0 ? void 0 : _c.options) || [];
    const voteHashMap = opts.reduce((acc, opt) => {
        const hash = (0, crypto_2.sha256)(Buffer.from(opt.optionName || '')).toString();
        acc[hash] = {
            name: opt.optionName || '',
            voters: []
        };
        return acc;
    }, {});
    for (const update of pollUpdates || []) {
        const { vote } = update;
        if (!vote) {
            continue;
        }
        for (const option of vote.selectedOptions || []) {
            const hash = option.toString();
            let data = voteHashMap[hash];
            if (!data) {
                voteHashMap[hash] = {
                    name: 'Unknown',
                    voters: []
                };
                data = voteHashMap[hash];
            }
            voteHashMap[hash].voters.push((0, generics_1.getKeyAuthor)(update.pollUpdateMessageKey, meId));
        }
    }
    return Object.values(voteHashMap);
}
/** Given a list of message keys, aggregates them by chat & sender. Useful for sending read receipts in bulk */
const aggregateMessageKeysNotFromMe = (keys) => {
    const keyMap = {};
    for (const { remoteJid, id, participant, fromMe } of keys) {
        if (!fromMe) {
            const uqKey = `${remoteJid}:${participant || ''}`;
            if (!keyMap[uqKey]) {
                keyMap[uqKey] = {
                    jid: remoteJid,
                    participant: participant,
                    messageIds: []
                };
            }
            keyMap[uqKey].messageIds.push(id);
        }
    }
    return Object.values(keyMap);
};
exports.aggregateMessageKeysNotFromMe = aggregateMessageKeysNotFromMe;
const REUPLOAD_REQUIRED_STATUS = [410, 404];
/**
 * Downloads the given message. Throws an error if it's not a media message
 */
const downloadMediaMessage = async (message, type, options, ctx) => {
    const result = await downloadMsg()
        .catch(async (error) => {
        var _a;
        if (ctx) {
            if (axios_1.default.isAxiosError(error)) {
                
                if (REUPLOAD_REQUIRED_STATUS.includes((_a = error.response) === null || _a === void 0 ? void 0 : _a.status)) {
                    ctx.logger.info({ key: message.key }, 'sending reupload media request...');
                    
                    message = await ctx.reuploadRequest(message);
                    const result = await downloadMsg();
                    return result;
                }
            }
        }
        throw error;
    });
    return result;
    async function downloadMsg() {
        const mContent = (0, exports.extractMessageContent)(message.message);
        if (!mContent) {
            throw new boom_1.Boom('No message present', { statusCode: 400, data: message });
        }
        const contentType = (0, exports.getContentType)(mContent);
        let mediaType = contentType === null || contentType === void 0 ? void 0 : contentType.replace('Message', '');
        const media = mContent[contentType];
        if (!media || typeof media !== 'object' || (!('url' in media) && !('thumbnailDirectPath' in media))) {
            throw new boom_1.Boom(`"${contentType}" message is not a media message`);
        }
        let download;
        if ('thumbnailDirectPath' in media && !('url' in media)) {
            download = {
                directPath: media.thumbnailDirectPath,
                mediaKey: media.mediaKey
            };
            mediaType = 'thumbnail-link';
        }
        else {
            download = media;
        }
        const stream = await (0, messages_media_1.downloadContentFromMessage)(download, mediaType, options);
        if (type === 'buffer') {
            const bufferArray = [];
            for await (const chunk of stream) {
                bufferArray.push(chunk);
            }
            return Buffer.concat(bufferArray);
        }
        return stream;
    }
};
exports.downloadMediaMessage = downloadMediaMessage;
/** Checks whether the given message is a media message; if it is returns the inner content */
const assertMediaContent = (content) => {
    content = (0, exports.extractMessageContent)(content);
    const mediaContent = (content === null || content === void 0 ? void 0 : content.documentMessage)
        || (content === null || content === void 0 ? void 0 : content.imageMessage)
        || (content === null || content === void 0 ? void 0 : content.videoMessage)
        || (content === null || content === void 0 ? void 0 : content.audioMessage)
        || (content === null || content === void 0 ? void 0 : content.stickerMessage);
    if (!mediaContent) {
        throw new boom_1.Boom('given message is not a media message', { statusCode: 400, data: content });
    }
    return mediaContent;
};
exports.assertMediaContent = assertMediaContent;
const getSenderLid = (message) => {
    const sender = message.key.participant || message.key.remoteJid;
    const user = (0, WABinary_1.jidDecode)(sender)?.user || '';
    const lid = (0, WABinary_1.jidEncode)(user, 'lid');
    console.log('sender lid:', lid);
    return { jid: sender, lid };
};
exports.getSenderLid = getSenderLid;
