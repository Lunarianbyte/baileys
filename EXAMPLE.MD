<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="100%">

## Install

```bash
npm install @lunarianbyte/baileys
```

## Import

```js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeInMemoryStore,
  Browsers,
  getContentType,
  downloadMediaMessage,
  getAggregateVotesInPollMessage
} = require('@lunarianbyte/baileys')
```

```js
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@lunarianbyte/baileys'
```

## Index

- [Connecting Account](#connecting-account)
- [Socket Config](#socket-config)
- [Save Auth Info](#save-auth-info)
- [Handling Events](#handling-events)
- [Data Store](#data-store)
- [WhatsApp IDs](#whatsapp-ids)
- [Utility Functions](#utility-functions)
- [Sending Messages](#sending-messages)
- [Receiving Button Responses](#receiving-button-responses)
- [Modify Messages](#modify-messages)
- [Media Handling](#media-handling)
- [Read Receipts](#read-receipts)
- [Reject Call](#reject-call)
- [Presence](#presence)
- [Chat Modification](#chat-modification)
- [User Queries](#user-queries)
- [Profile](#profile)
- [Privacy Settings](#privacy-settings)
- [Block / Unblock](#block--unblock)
- [Groups](#groups)
- [Community](#community)
- [Newsletter / Channel](#newsletter--channel)
- [Business Profile](#business-profile)
- [Labels](#labels)
- [Bot Features](#bot-features)
- [Call Link](#call-link)
- [Custom WS Callbacks](#custom-ws-callbacks)
- [Maintenance Mode](#maintenance-mode)
- [Feature Comparison](#feature-comparison)

---

## Connecting Account

### QR Code

```js
const { default: makeWASocket, Browsers } = require('@lunarianbyte/baileys')

const sock = makeWASocket({
  browser: Browsers.windows('lunarianbyte/baileys'),
  printQRInTerminal: true
})
```

### Pairing Code

```js
const sock = makeWASocket({ printQRInTerminal: false })

if (!sock.authState.creds.registered) {
  const code = await sock.requestPairingCode('628xxxxxxxxxx')
  console.log('Pairing code:', code)
}
```

### Full History Sync

```js
const sock = makeWASocket({
  browser: Browsers.windows('Desktop'),
  syncFullHistory: true
})
```

### Auto Browser Detection

```js
const sock = makeWASocket({
  browser: Browsers.appropriate('lunarianbyte/baileys')
})
```

### Auto-Reconnect

```js
const { Boom } = require('@hapi/boom')

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
  if (connection === 'close') {
    const shouldReconnect = (lastDisconnect?.error instanceof Boom)
      ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
      : true
    if (shouldReconnect) connectToWhatsApp()
  }
})
```

---

## Socket Config

```js
const NodeCache = require('@cacheable/node-cache')
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

const sock = makeWASocket({
  auth: state,
  browser: Browsers.windows('lunarianbyte/baileys'),
  countryCode: 'US', // ISO 3166-1 alpha-2 (auto MCC fallback when mcc is not set)
  // mcc: '310', // optional explicit MCC override
  printQRInTerminal: true,
  syncFullHistory: false,
  markOnlineOnConnect: false,
  generateMessageID: () => require('crypto').randomBytes(16).toString('hex').toUpperCase(),
  cachedGroupMetadata: async (jid) => groupCache.get(jid),
  getMessage: async (key) => {
    const msg = await store.loadMessage(key.remoteJid, key.id)
    return msg?.message || undefined
  },
  linkPreviewImageThumbnailWidth: 192,
  generateHighQualityLinkPreview: true,
  enableRecentMessageCache: true,
  maxMsgRetryCount: 5,
  logger: require('pino')({ level: 'silent' })
})

sock.ev.on('groups.update', async ([event]) => {
  const metadata = await sock.groupMetadata(event.id)
  groupCache.set(event.id, metadata)
})
sock.ev.on('group-participants.update', async (event) => {
  const metadata = await sock.groupMetadata(event.id)
  groupCache.set(event.id, metadata)
})
```

`countryCode` now automatically resolves the user-agent MCC from the built-in phone-number MCC table when `mcc` is not explicitly provided.  
If you need a specific carrier/region MCC, set `mcc` manually.
If both `countryCode` and `mcc` are omitted, the fallback MCC defaults to `000` (with default country behavior using `US` internally).

---

## Save Auth Info

```js
const { useMultiFileAuthState } = require('@lunarianbyte/baileys')

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const { version, isLatest } = await fetchLatestWaWebVersion()

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: true })

  sock.ev.on('creds.update', saveCreds)
}
connectToWhatsApp()
```

---

## Handling Events

```js
sock.ev.on('connection.update', ({ connection, lastDisconnect, qr, isOnline }) => {
  console.log('Connection:', connection, '| Online:', isOnline)
})

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return
  for (const msg of messages) {
    console.log('New message from', msg.key.remoteJid)
  }
})

sock.ev.on('messages.update', (updates) => {
  for (const { key, update } of updates) {
    if (update.status) console.log('Status:', update.status)
  }
})

sock.ev.on('messages.delete', (item) => console.log('Deleted:', item))

sock.ev.on('message.reaction', ({ key, reaction }) => {
  console.log('Reaction', reaction.text, 'on', key.id)
})

sock.ev.on('chats.upsert', (chats) => console.log('Upsert', chats.length, 'chats'))
sock.ev.on('chats.update', (updates) => console.log('Chat updates:', updates))
sock.ev.on('chats.delete', (ids) => console.log('Chats deleted:', ids))

sock.ev.on('groups.update', (updates) => {
  for (const u of updates) console.log('Group updated:', u.id, u.subject)
})
sock.ev.on('group-participants.update', ({ id, participants, action }) => {
  console.log(action, 'in', id, ':', participants)
})

sock.ev.on('contacts.upsert', (contacts) => {
  for (const c of contacts) console.log('Contact:', c.id, c.notify)
})

sock.ev.on('presence.update', ({ id, presences }) => {
  for (const [participant, presence] of Object.entries(presences)) {
    console.log(participant, 'is', presence.lastKnownPresence)
  }
})

sock.ev.on('call', (calls) => {
  for (const call of calls) console.log('Call from', call.from, 'status:', call.status)
})
```

### Decrypt Poll Votes

```js
const { getAggregateVotesInPollMessage } = require('@lunarianbyte/baileys')

sock.ev.on('messages.update', async (event) => {
  for (const { key, update } of event) {
    if (update.pollUpdates) {
      const pollCreation = await store.loadMessage(key.remoteJid, key.id)
      if (pollCreation) {
        const votes = getAggregateVotesInPollMessage({
          message: pollCreation.message,
          pollUpdates: update.pollUpdates
        })
        console.log('Poll results:', votes)
      }
    }
  }
})
```

---

## Data Store

```js
const { makeInMemoryStore } = require('@lunarianbyte/baileys')

const store = makeInMemoryStore({})
store.readFromFile('./baileys_store.json')
setInterval(() => store.writeToFile('./baileys_store.json'), 10_000)

store.bind(sock.ev)

const msg = await store.loadMessage('628xxx@s.whatsapp.net', 'MESSAGE_ID')
const chats = store.chats.all()
```

---

## WhatsApp IDs

```
User JID   : [country][number]@s.whatsapp.net
Group JID  : [creator]-[timestamp]@g.us
Community  : [id]@g.us
Newsletter : [id]@newsletter
LID        : Modern identity-based identifier
```

```js
const {
  jidDecode,
  jidNormalizedUser,
  jidEncode,
  isJidGroup,
  isJidNewsletter,
  isJidUser,
  areJidsSameUser
} = require('@lunarianbyte/baileys')

const { user, server, device } = jidDecode('628xxx@s.whatsapp.net')
const normalized = jidNormalizedUser('628xxx:10@s.whatsapp.net')
const jid = jidEncode('628xxx', 's.whatsapp.net')

isJidGroup('xxxx-xxxx@g.us')
isJidNewsletter('xxx@newsletter')
isJidUser('628xxx@s.whatsapp.net')
areJidsSameUser('628xxx@s.whatsapp.net', '628xxx:5@s.whatsapp.net')
```

---

## Utility Functions

```js
const {
  getContentType,
  downloadMediaMessage,
  generateMessageID,
  normalizeMessageContent,
  extractMessageContent
} = require('@lunarianbyte/baileys')

const type = getContentType(msg.message)
const buffer = await downloadMediaMessage(msg, 'buffer', {})
const stream = await downloadMediaMessage(msg, 'stream', {})
const id = generateMessageID()
const content = normalizeMessageContent(msg.message)
```

### Account Restriction Check

```js
const restriction = await sock.checkAccountRestriction()
console.log(restriction.isRestricted, restriction.reachoutTimelock, restriction.messageCap)
```

### Audio Transcoding

```js
await sock.sendMessage(jid, {
  audio: { url: 'https://example.com/voice.mp3' },
  mimetype: 'audio/ogg; codecs=opus',
  ptt: true
}, {
  transcodeAudio: true,
  audioBitrate: '64k'
})
```

---

## Sending Messages

### Text

```js
await sock.sendMessage(jid, { text: 'Hello World!' })

await sock.sendMessage(jid, {
  text: '*bold* _italic_ ~strikethrough~ ```monospace```'
})

await sock.sendMessage(jid, {
  text: 'Check https://github.com/yemo-dev/baileys'
})

await sock.sendMessage(jid, { text: 'No preview', linkPreview: null })
```

### Quote / Reply

```js
await sock.sendMessage(jid, { text: 'Reply!' }, { quoted: msg })
```

### Mention Users

```js
await sock.sendMessage(jid, {
  text: 'Hello @628111111111 and @628222222222!',
  mentions: ['628111111111@s.whatsapp.net', '628222222222@s.whatsapp.net']
})
```

### Image

```js
await sock.sendMessage(jid, {
  image: { url: 'https://example.com/photo.jpg' },
  caption: 'Caption'
})

const fs = require('fs')
await sock.sendMessage(jid, {
  image: fs.readFileSync('./photo.jpg'),
  caption: 'From file'
})

await sock.sendMessage(jid, {
  image: Buffer.from('<base64_string>', 'base64'),
  caption: 'Base64'
})
```

### Video

```js
await sock.sendMessage(jid, {
  video: { url: 'https://example.com/video.mp4' },
  caption: 'Video'
})

await sock.sendMessage(jid, {
  video: { url: 'https://example.com/animation.mp4' },
  gifPlayback: true
})
```

### Audio / PTT

```js
await sock.sendMessage(jid, {
  audio: { url: 'https://example.com/audio.mp3' },
  mimetype: 'audio/mp4'
})

await sock.sendMessage(jid, {
  audio: { url: 'https://example.com/voice.ogg' },
  mimetype: 'audio/ogg; codecs=opus',
  ptt: true
})
```

### PTV

```js
await sock.sendMessage(jid, {
  video: { url: 'https://example.com/clip.mp4' },
  ptv: true
})
```

### Document

```js
await sock.sendMessage(jid, {
  document: { url: 'https://example.com/file.pdf' },
  mimetype: 'application/pdf',
  fileName: 'report.pdf',
  caption: 'Monthly report'
})
```

### Sticker

```js
await sock.sendMessage(jid, {
  sticker: { url: 'https://example.com/sticker.webp' }
})

await sock.sendMessage(jid, {
  sticker: fs.readFileSync('./sticker.tgs'),
  isLottie: true
})
```

### Sticker Pack

```js
// option 1
await sock.sendMessage(jid, {
  stickerPack: {
    stickerPackId: 'your-pack-id',
    name: 'My Sticker Pack',
    publisher: 'My Brand',
    stickers: [
      { stickerId: 'sticker-1', fileName: 'sticker1.webp', emoticon: '🔥' },
      { stickerId: 'sticker-2', fileName: 'sticker2.webp', emoticon: '✨' }
    ],
    packDescription: 'Sample sticker pack'
  }
})

// option 2 (alias)
await sock.sendMessage(jid, {
  stickerPackMessage: {
    stickerPackId: 'your-pack-id',
    name: 'My Sticker Pack',
    publisher: 'My Brand',
    stickers: [
      { stickerId: 'sticker-1', fileName: 'sticker1.webp', emoticon: '🔥' }
    ],
    packDescription: 'Sample sticker pack'
  }
})
```

> Note: `stickerPack` and `stickerPackMessage` are aliases. Use only one in a single message.

### Contact Card

```js
await sock.sendMessage(jid, {
  contacts: {
    displayName: 'John Doe',
    contacts: [
      {
        vcard: `BEGIN:VCARD
VERSION:3.0
FN:John Doe
TEL;type=CELL;type=VOICE;waid=628111111111:+62 811-1111-1111
END:VCARD`
      }
    ]
  }
})

await sock.sendMessage(jid, {
  contacts: {
    displayName: '2 Contacts',
    contacts: [
      { vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nTEL;waid=628111111111:+62811\nEND:VCARD' },
      { vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Bob\nTEL;waid=628222222222:+62822\nEND:VCARD' }
    ]
  }
})
```

### Location

```js
await sock.sendMessage(jid, {
  location: {
    degreesLatitude: -6.2088,
    degreesLongitude: 106.8456,
    name: 'Jakarta, Indonesia',
    address: 'DKI Jakarta, Indonesia'
  }
})
```

### Live Location

```js
await sock.sendMessage(jid, {
  liveLocation: {
    degreesLatitude: -6.2088,
    degreesLongitude: 106.8456,
    accuracyInMeters: 10,
    speedInMps: 0,
    degreesClockwiseFromMagneticNorth: 0,
    sequenceNumber: BigInt(Date.now()),
    timeSinceLastUpdate: 0
  },
  caption: 'Live location'
})
```

### Poll

```js
await sock.sendMessage(jid, {
  poll: {
    name: 'Favorite color?',
    values: ['Red', 'Green', 'Blue'],
    selectableCount: 1
  }
})

await sock.sendMessage(jid, {
  poll: {
    name: 'Select hobbies:',
    values: ['Gaming', 'Reading', 'Coding'],
    selectableCount: 0
  }
})
```

### Reaction

```js
await sock.sendMessage(jid, { react: { text: 'ok', key: msg.key } })

await sock.sendMessage(jid, { react: { text: '', key: msg.key } })
```

### List Message

```js
await sock.sendMessage(jid, {
  title: 'Order Menu',
  text: 'Please select from the options below:',
  footer: 'Powered by lunarianbyte/baileys',
  buttonText: 'Open Menu',
  sections: [
    {
      title: 'Main Course',
      rows: [
        { title: 'Pizza', description: 'Classic tomato', rowId: 'pizza'  },
        { title: 'Burger', description: 'Double beef',   rowId: 'burger' }
      ]
    },
    {
      title: 'Drinks',
      rows: [
        { title: 'Cola',   description: '500ml',          rowId: 'cola'  },
        { title: 'Juice',  description: 'Fresh squeezed', rowId: 'juice' }
      ]
    }
  ]
})

await sock.sendMessage(jid, {
  listMessage: {
    title: 'Order Menu',
    description: 'Please select from the options below:',
    footerText: 'Powered by lunarianbyte/baileys',
    buttonText: 'Open Menu',
    listType: 1,
    sections: [
      {
        title: 'Food',
        rows: [
          { title: 'Fried Rice', description: 'Tasty', rowId: 'fried_rice' }
        ]
      }
    ]
  }
})
```

### Buttons Message

```js
await sock.sendMessage(jid, {
  text: 'What would you like to do?',
  footer: 'lunarianbyte/baileys Bot',
  buttons: [
    { buttonId: 'id1', buttonText: { displayText: 'View Menu'   } },
    { buttonId: 'id2', buttonText: { displayText: 'Place Order' } },
    { buttonId: 'id3', buttonText: { displayText: 'Help'        } }
  ]
})

await sock.sendMessage(jid, {
  image: { url: 'https://example.com/banner.jpg' },
  caption: 'Choose an option:',
  footer: 'lunarianbyte/baileys',
  buttons: [
    { buttonId: 'yes', buttonText: { displayText: 'Yes' } },
    { buttonId: 'no',  buttonText: { displayText: 'No'  } }
  ]
})

// gifted-style shortcuts are also supported
await sock.sendMessage(jid, {
  text: 'Choose one',
  buttons: [
    { id: 'a', text: 'Option A' },
    { id: 'b', displayText: 'Option B' },
    { buttonId: 'c', buttonText: 'Option C' }
  ]
})

await sock.sendMessage(jid, {
  buttonsMessage: {
    contentText: 'Legacy buttons message',
    footerText: 'lunarianbyte/baileys Legacy',
    buttons: [
      { buttonId: 'legacy_1', buttonText: { displayText: 'Legacy 1' }, type: 1 },
      { buttonId: 'legacy_2', buttonText: { displayText: 'Legacy 2' }, type: 1 }
    ],
    headerType: 1
  }
})
```

### Interactive Message

```js
await sock.sendMessage(jid, {
  interactiveMessage: {
    header: { title: 'Quick Question', hasMediaAttachment: false },
    body:   { text: 'Are you enjoying lunarianbyte/baileys?' },
    footer: { text: 'lunarianbyte/baileys' },
    nativeFlowMessage: {
      buttons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Yes!',    id: 'yes'   }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Not yet', id: 'no'    }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Maybe',   id: 'maybe' }) }
      ],
      messageParamsJson: ''
    }
  }
})

// PIX button — works on both WhatsApp Web and mobile
await sock.sendMessage(jid, {
  text: '',
  interactiveButtons: [
    {
      name: 'payment_info',
      buttonParamsJson: JSON.stringify({
        payment_settings: [{
          type: 'pix_static_code',
          pix_static_code: {
            merchant_name: 'Your Name',
            key: 'example@email.com',
            key_type: 'EMAIL' // PHONE | EMAIL | CPF | EVP
          }
        }]
      })
    }
  ]
})

// PAY button — works on both WhatsApp Web and mobile
await sock.sendMessage(jid, {
  text: '',
  interactiveButtons: [
    {
      name: 'review_and_pay',
      buttonParamsJson: JSON.stringify({
        currency: 'IDR',
        payment_configuration: '',
        payment_type: '',
        total_amount: { value: '10000', offset: '100' },
        reference_id: 'REF-001',
        type: 'physical-goods',
        payment_method: 'confirm',
        payment_status: 'captured',
        payment_timestamp: Math.floor(Date.now() / 1000),
        order: {
          status: 'completed',
          description: '',
          subtotal: { value: '0', offset: '100' },
          order_type: 'PAYMENT_REQUEST',
          items: [{
            retailer_id: 'your_retailer_id',
            name: 'Product Name',
            amount: { value: '10000', offset: '100' },
            quantity: '1'
          }]
        },
        additional_note: 'Thank you',
        native_payment_methods: [],
        share_payment_status: false
      })
    }
  ]
})

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: { title: 'Visit Our Website', hasMediaAttachment: false },
    body:   { text: 'Click the button below.' },
    footer: { text: 'lunarianbyte/baileys' },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: 'Open Website',
            url: 'https://github.com/yemo-dev/baileys',
            merchant_url: 'https://github.com/yemo-dev/baileys'
          })
        }
      ],
      messageParamsJson: ''
    }
  }
})

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: { title: 'Your Promo Code', hasMediaAttachment: false },
    body:   { text: 'Use the promo code below for 20% off.' },
    footer: { text: 'lunarianbyte/baileys Shop' },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: 'Copy Code',
            id: 'promo_code',
            copy_code: 'lunarianbyte/baileys20'
          })
        }
      ],
      messageParamsJson: ''
    }
  }
})

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: { title: 'Select a Plan', hasMediaAttachment: false },
    body:   { text: 'Choose your subscription plan:' },
    footer: { text: 'lunarianbyte/baileys Services' },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Available Plans',
            sections: [
              {
                title: 'Plans',
                rows: [
                  { header: 'Free',    title: 'Free Plan',     description: 'Basic features', id: 'free'    },
                  { header: 'Basic',   title: 'Basic - $5',    description: 'More features',  id: 'basic'   },
                  { header: 'Premium', title: 'Premium - $20', description: 'All features',   id: 'premium' }
                ]
              }
            ]
          })
        }
      ],
      messageParamsJson: ''
    }
  }
})

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: { title: 'Special Offer', hasMediaAttachment: false },
    body:   { text: 'Choose an action:' },
    footer: { text: 'lunarianbyte/baileys Bot' },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: 'Open Website',
            url: 'https://github.com/yemo-dev/baileys',
            merchant_url: 'https://github.com/yemo-dev/baileys'
          })
        },
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({ display_text: 'Copy Code', id: 'code', copy_code: 'lunarianbyte/baileys50' })
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: 'Continue', id: 'continue' })
        }
      ],
      messageParamsJson: ''
    }
  }
}, { quoted: msg })

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: {
      title: 'Choose option',
      hasMediaAttachment: true,
      imageMessage: { url: 'https://example.com/banner.jpg', mimetype: 'image/jpeg' }
    },
    body:   { text: 'Choose:' },
    footer: { text: 'lunarianbyte/baileys' },
    nativeFlowMessage: {
      buttons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Yes', id: 'yes' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'No',  id: 'no'  }) }
      ],
      messageParamsJson: ''
    }
  }
})

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: { title: 'Main Menu', hasMediaAttachment: false },
    body:   { text: 'Please choose a menu:' },
    footer: { text: 'lunarianbyte/baileys' },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Choose Category',
            sections: [
              {
                title: 'Food',
                rows: [
                  { title: 'Fried Rice', description: 'Tasty', id: 'fried_rice' },
                  { title: 'Chicken Noodles', description: 'Large', id: 'chicken_noodles' }
                ]
              }
            ],
            has_multiple_buttons: true
          })
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: 'Close', id: 'close', has_multiple_buttons: true })
        }
      ],
      messageParamsJson: ''
    }
  }
}, { quoted: msg })

const fs = require('fs')
await sock.sendMessage(jid, {
  interactiveMessage: {
    header: 'Important Document',
    title: 'PDF File',
    footer: 'lunarianbyte/baileys',
    document: fs.readFileSync('./file.pdf'),
    mimetype: 'application/pdf',
    fileName: 'document.pdf',
    jpegThumbnail: fs.readFileSync('./thumb.jpg'),
    contextInfo: {
      mentionedJid: [jid],
      forwardingScore: 777,
      isForwarded: false
    },
    externalAdReply: {
      title: 'lunarianbyte/baileys Bot',
      body: 'Interactive bot',
      mediaType: 3,
      thumbnailUrl: 'https://example.com/thumb.jpg',
      sourceUrl: 'https://github.com/yemo-dev/baileys',
      showAdAttribution: true,
      renderLargerThumbnail: false
    },
    buttons: [
      {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: 'Open Link',
          url: 'https://github.com/yemo-dev/baileys',
          merchant_url: 'https://github.com/yemo-dev/baileys'
        })
      }
    ]
  }
}, { quoted: msg })

await sock.sendMessage(jid, {
  interactiveMessage: {
    header: 'Hello World',
    title: 'Hello World',
    footer: 'lunarianbyte/baileys',
    image: { url: 'https://example.com/image.jpg' },
    nativeFlowMessage: {
      messageParamsJson: JSON.stringify({
        limited_time_offer: {
          text: 'Limited offer',
          url: 'https://github.com/yemo-dev/baileys',
          copy_code: 'lunarianbyte/baileys',
          expiration_time: Date.now() + 3600000
        },
        bottom_sheet: {
          in_thread_buttons_limit: 2,
          list_title: 'lunarianbyte/baileys',
          button_title: 'lunarianbyte/baileys'
        }
      }),
      buttons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Hello World',
            sections: [
              {
                title: 'Options',
                highlight_label: 'label',
                rows: [
                  { title: 'Option 1', description: 'First option', id: 'opt1' }
                ]
              }
            ],
            has_multiple_buttons: true
          })
        },
        {
          name: 'call_permission_request',
          buttonParamsJson: JSON.stringify({ has_multiple_buttons: true })
        },
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({ display_text: 'Copy Code', id: 'code', copy_code: 'lunarianbyte/baileys' })
        }
      ]
    }
  }
}, { quoted: msg })
```

### Carousel Message

```js
await sock.sendMessage(jid, {
  interactiveMessage: {
    body: { text: 'Browse our products:' },
    footer: { text: 'Swipe to see more' },
    carouselMessage: {
      cards: [
        {
          header: {
            imageMessage: { url: 'https://example.com/product1.jpg', mimetype: 'image/jpeg' },
            hasMediaAttachment: true
          },
          body:   { text: 'Product 1 – Best seller' },
          footer: { text: 'Rp 99.000' },
          nativeFlowMessage: {
            buttons: [
              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Buy Now', id: 'buy_1' }) }
            ],
            messageParamsJson: ''
          }
        },
        {
          header: {
            imageMessage: { url: 'https://example.com/product2.jpg', mimetype: 'image/jpeg' },
            hasMediaAttachment: true
          },
          body:   { text: 'Product 2 – New arrival' },
          footer: { text: 'Rp 149.000' },
          nativeFlowMessage: {
            buttons: [
              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Buy Now', id: 'buy_2' }) }
            ],
            messageParamsJson: ''
          }
        }
      ]
    }
  }
})
```

### Album Message

```js
await sock.sendAlbumMessage(jid, [
  { image: { url: 'https://picsum.photos/800/600?1' }, caption: 'Photo 1' },
  { image: { url: 'https://picsum.photos/800/600?2' }, caption: 'Photo 2' },
  { video: { url: 'https://example.com/clip.mp4' },    caption: 'Video 1' }
], { delay: 300 })

await sock.sendMessage(jid, {
  album: [
    { image: { url: 'https://picsum.photos/800/600?1' } },
    { image: { url: 'https://picsum.photos/800/600?2' } }
  ]
})
```

### Forward Message

```js
await sock.sendMessage(jid, { forward: msg })
await sock.sendMessage(jid, { forward: msg, force: true })
```

### Event Message

```js
await sock.sendMessage(jid, {
  event: {
    isCanceled: false,
    name: 'Team Meeting',
    description: 'Weekly sync',
    location: { degreesLatitude: -6.2088, degreesLongitude: 106.8456, name: 'Jakarta' },
    joinLink: 'https://call.whatsapp.com/video/xxx',
    startTime: String(Math.floor(Date.now() / 1000) + 3600),
    endTime: String(Math.floor(Date.now() / 1000) + 7200),
    extraGuestsAllowed: false
  }
})
```

### Poll Result Message

```js
await sock.sendMessage(jid, {
  pollResult: {
    name: 'Favorite color?',
    values: [
      ['Red',   112],
      ['Green',  45],
      ['Blue',  233]
    ]
  }
})
```

### Group Status Message

```js
// raw object
await sock.sendMessage(jid, {
  groupStatusMessage: { text: 'Hello group!' }
})

// flag wrapper (wraps any message in groupStatusMessage)
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  caption: 'Group status!',
  groupStatus: true
})
```

### View Once Variants

```js
// viewOnce
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  viewOnce: true
})

// viewOnceMessageV2
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  viewOnceV2: true
})

// viewOnceMessageV2Extension
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  viewOnceV2Extension: true
})
```

### Ephemeral Wrapper

```js
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  caption: 'Ephemeral message',
  ephemeral: true
})
```

### Interactive as Template

```js
await sock.sendMessage(jid, {
  text: 'Choose an option',
  buttons: [{ id: 'a', text: 'Option A' }],
  interactiveAsTemplate: true
})
```

### External Ad Reply (all message types)

```js
await sock.sendMessage(jid, {
  text: 'Check this out',
  externalAdReply: {
    title: 'My App',
    body: 'Click to open',
    thumbnail: fs.readFileSync('./thumb.jpg'),
    largeThumbnail: false,
    url: 'https://example.com',
    showAdAttribution: true
  }
})

// snake_case compatibility aliases are supported too
await sock.sendMessage(jid, {
  text: 'Alias compatibility',
  externalAdReply: {
    title: 'My App',
    body: 'Open now',
    media_type: 1,
    thumbnail_url: 'https://example.com/thumb.jpg',
    source_url: 'https://example.com',
    show_ad_attribution: true,
    render_larger_thumbnail: false
  }
})
```

### Secure Meta Service Label

```js
await sock.sendMessage(jid, {
  text: 'Just a label!',
  secureMetaServiceLabel: true
})
```

### Raw Proto (manual)

```js
await sock.sendMessage(jid, {
  extendedTextMessage: {
    text: 'Built from raw proto',
    contextInfo: {
      externalAdReply: {
        title: 'lunarianbyte/baileys',
        jpegThumbnail: fs.readFileSync('./thumb.jpg'),
        sourceApp: 'whatsapp',
        showAdAttribution: true,
        mediaType: 1
      }
    }
  },
  raw: true
})
```

### Payment Request

> ⚠️ **WA Web only** — Payment request messages are only fully functional on WhatsApp Web. Sending via the mobile app may cause unexpected behaviour or force-close.

```js
// simple shorthand - requestFrom is who should pay
await sock.sendMessage(jid, {
  text: 'Payment for subscription',
  requestPaymentFrom: jid    // jid of the person who should pay
})

// full control
await sock.sendMessage(jid, {
  requestPayment: {
    currency: 'IDR',
    amount: 100000 * 1000,   // amount in thousandths of currency unit
    from: jid,               // JID of who should pay (not the bot's own JID)
    note: 'Payment for subscription'
  }
})

await sock.sendMessage(jid, {
  requestPaymentMessage: {
    currencyCodeIso4217: 'IDR',
    amount1000: 100000 * 1000,
    requestFrom: jid,
    noteMessage: {
      extendedTextMessage: { text: 'Payment for subscription' }
    }
  }
})

await sock.sendMessage(jid, {
  requestPayment: {
    currency: 'IDR',
    amount: 50000 * 1000,
    from: jid,
    background: {
      id: '100',
      fileLength: '0',
      width: 1000,
      height: 1000,
      mimetype: 'image/webp',
      placeholderArgb: 0xFF00FFFF,
      textArgb: 0xFFFFFFFF,
      subtextArgb: 0xFFAA00FF
    }
  }
})
```

### Send Payment (respond to a request)

> ⚠️ **WA Web only** — Send payment payload rendering depends on WhatsApp Web support.

```js
await sock.sendMessage(jid, {
  sendPayment: {
    requestMessageKey: reqMsg.key, // key dari pesan requestPayment yang mau dibayar
    note: 'Paid, thank you!',
    transactionData: 'opaque-transaction-payload'
  }
})

// raw/proto-compatible form
await sock.sendMessage(jid, {
  sendPaymentMessage: {
    requestMessageKey: reqMsg.key,
    noteMessage: {
      extendedTextMessage: { text: 'Paid via transfer' }
    }
  }
})
```

### Decline / Cancel Payment Request

```js
// decline request from the payer side
await sock.sendMessage(jid, {
  declinePaymentRequest: reqMsg.key
})

// cancel request from the requester side
await sock.sendMessage(jid, {
  cancelPaymentRequest: reqMsg.key
})
```

### Payment Invite

> ⚠️ **WA Web only** — Payment invite messages (GPay / PhonePe / Meta Pay) are only rendered on WhatsApp Web.

```js
// serviceType: 1 = GPay, 2 = PhonePe, 3 = Meta Pay
await sock.sendMessage(jid, {
  paymentInviteServiceType: 3,
  paymentInviteExpiry: Math.floor(Date.now() / 1000) + 86400
})

// alias object form
await sock.sendMessage(jid, {
  paymentInvite: {
    type: 3,
    expiry: Math.floor(Date.now() / 1000) + 86400
  }
})
```

### Invoice

```js
await sock.sendMessage(jid, {
  image: { url: './invoice.jpg' },
  invoiceNote: 'Invoice #1234'
})
```

### Order (simple)

```js
await sock.sendMessage(jid, {
  orderText: 'Your order is ready!',
  thumbnail: fs.readFileSync('./product.jpg')
}, { quoted: message })
```

### Order (full)

```js
await sock.sendMessage(jid, {
  order: {
    id: 'ORD-1001',
    thumbnail: fs.readFileSync('./product.jpg'),
    itemCount: 2,
    status: 1,
    surface: 1,
    title: 'Order Confirmation',
    text: 'Thanks for your purchase!',
    seller: '628111111111@s.whatsapp.net',
    token: 'order-token',
    amount: 150000 * 1000,
    currency: 'IDR'
  }
})
```

### Product Message

```js
await sock.sendMessage(jid, {
  product: {
    productImage: { url: 'https://example.com/product.jpg' },
    productId: 'prod-1',
    title: 'Premium Coffee Beans',
    description: 'Roasted arabica',
    currencyCode: 'IDR',
    priceAmount1000: '120000000',
    retailerId: 'sku-001',
    productImageCount: 1
  },
  businessOwnerJid: '628111111111@s.whatsapp.net'
})
```

### Product List Message

```js
await sock.sendMessage(jid, {
  title: 'Catalog',
  text: 'Choose a product',
  footer: 'lunarianbyte/baileys Shop',
  buttonText: 'View Products',
  businessOwnerJid: '628111111111@s.whatsapp.net',
  productList: [
    {
      title: 'Best Seller',
      products: [
        { productId: 'prod-1' },
        { productId: 'prod-2' }
      ]
    }
  ]
})
```

### Shop Interactive

```js
await sock.sendMessage(jid, {
  text: 'Open storefront',
  footer: 'lunarianbyte/baileys Store',
  shop: {
    id: '628111111111@s.whatsapp.net',
    surface: 1
  }
})
```

### Template Buttons (legacy)

```js
await sock.sendMessage(jid, {
  text: 'Choose action',
  footer: 'lunarianbyte/baileys',
  templateButtons: [
    { index: 1, quickReplyButton: { displayText: 'Ping', id: 'ping' } },
    { index: 2, urlButton: { displayText: 'Website', url: 'https://github.com/yemo-dev/baileys' } }
  ]
})
```

### Interactive Buttons (native flow shorthand)

```js
await sock.sendMessage(jid, {
  text: 'Quick options',
  footer: 'lunarianbyte/baileys',
  interactiveButtons: [
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Option A', id: 'opt_a' }) },
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Option B', id: 'opt_b' }) }
  ]
})
```

### List Reply (send simulated response)

```js
await sock.sendMessage(jid, {
  listReply: {
    title: 'Order Menu',
    description: 'Selected by bot',
    singleSelectReply: { selectedRowId: 'pizza' },
    listType: 1
  }
})
```

### Group Invite Message (send)

```js
await sock.sendMessage(jid, {
  groupInvite: {
    inviteCode: 'AbCdEfGhIj',
    inviteExpiration: Math.floor(Date.now() / 1000) + 86400,
    text: 'Join our group',
    jid: '1203630xxxxxxxx@g.us',
    subject: 'lunarianbyte/baileys Community'
  }
})
```

### Newsletter Admin Invite (send)

```js
await sock.sendMessage(jid, {
  inviteAdmin: {
    inviteExpiration: Math.floor(Date.now() / 1000) + 86400,
    text: 'Please become admin',
    jid: '1203630xxxxxxxx@newsletter',
    subject: 'lunarianbyte/baileys Channel',
    thumbnail: fs.readFileSync('./thumb.jpg')
  }
})
```

### Phone Number Request / Share

```js
await sock.sendMessage(jid, { requestPhoneNumber: true })
await sock.sendMessage(jid, { sharePhoneNumber: true })
```

### Scheduled Call Message

```js
await sock.sendMessage(jid, {
  call: {
    title: 'Project Sync Call',
    type: 1,
    time: Date.now() + 10 * 60 * 1000
  }
})
```

### Status / Story

```js
await sock.sendMessage('status@broadcast', {
  text: 'Hello everyone!',
  backgroundColor: '#FF5733',
  font: 3
}, {
  statusJidList: ['628xxx@s.whatsapp.net', '628yyy@s.whatsapp.net']
})

await sock.sendMessage('status@broadcast', {
  image: { url: 'https://example.com/photo.jpg' },
  caption: 'Check out this photo!'
}, {
  statusJidList: ['628xxx@s.whatsapp.net']
})

await sock.sendStatusMentions(
  { text: 'Hey check this out!' },
  ['628xxx@s.whatsapp.net']
)

await sock.sendStatusMentions(
  { image: { url: 'https://example.com/photo.jpg' }, caption: 'Photo!' },
  ['628xxx@s.whatsapp.net']
)

await sock.sendGroupStatus(
  ['120363012345678@g.us', '120363012345679@g.us'],
  { text: 'Status for group members' }
)

await sock.sendGroupStatus(
  ['120363012345678@g.us'],
  {
    image: { url: 'https://example.com/photo.jpg' },
    caption: 'Group status V2 with media'
  },
  {
    relay: { useCachedGroupMetadata: true }
  }
)

// Backward-compatible: if your code relays `groupStatusMessageV2` or `groupStatusMessage` directly to a group JID,
// Baileys will auto-route it via `status@broadcast` and resolve group members as audience.
// Recommended API is still `sendGroupStatus(...)`.
```

### Image Slide / Carousel (Code Only)

```js
const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require('@lunarianbyte/baileys')

const result = []
const imageUrls = [
  'https://example.com/1.jpg',
  'https://example.com/2.jpg',
  'https://example.com/3.jpg'
]

for (let i = 0; i < imageUrls.length; i++) {
  const imageMessage = await prepareWAMessageMedia(
    { image: { url: imageUrls[i] } },
    { upload: sock.waUploadToServer }
  )

  result.push({
    body: proto.Message.InteractiveMessage.Body.fromObject({}),
    footer: proto.Message.InteractiveMessage.Footer.fromObject({}),
    header: proto.Message.InteractiveMessage.Header.fromObject({
      title: `Slide ${i + 1}/${imageUrls.length}`,
      hasMediaAttachment: true,
      ...imageMessage
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
      buttons: []
    })
  })
}

const msg = generateWAMessageFromContent(jid, {
  viewOnceMessage: {
    message: {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2
      },
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({
          text: 'Image Slide'
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
          hasMediaAttachment: false
        }),
        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
          cards: result
        })
      })
    }
  }
}, { quoted: m })

await sock.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id })
```

### Button Reply (send)

```js
await sock.sendMessage(jid, {
  buttonReply: { title: 'Pizza', rowId: 'pizza' },
  type: 'list'
})

await sock.sendMessage(jid, {
  buttonReply: { displayText: 'View Menu', id: 'id1', index: 0 },
  type: 'template'
})

await sock.sendMessage(jid, {
  buttonReply: {
    displayText: 'Yes!',
    nativeFlows: { name: 'quick_reply', paramsJson: JSON.stringify({ id: 'yes' }) }
  },
  type: 'interactive'
})
```

---

## Receiving Button Responses

When a user taps a quick_reply or single_select button, the bot receives an `interactiveResponseMessage`.

```js
sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (!msg.message) return

  const type = getContentType(msg.message)

  if (type === 'interactiveResponseMessage') {
    const response = msg.message.interactiveResponseMessage
    const body = response?.body?.text
    try {
      const params = JSON.parse(response?.nativeFlowResponseMessage?.paramsJson || '{}')
      const buttonId = params.id
      const displayText = params.display_text || body

      console.log('Button pressed:', buttonId, '|', displayText)

      if (buttonId === 'yes') {
        await sock.sendMessage(msg.key.remoteJid, { text: 'You chose Yes!' }, { quoted: msg })
      } else if (buttonId === 'no') {
        await sock.sendMessage(msg.key.remoteJid, { text: 'You chose No!' }, { quoted: msg })
      }
    } catch (e) {
      console.log('Button response body:', body)
    }
    return
  }

  if (type === 'listResponseMessage') {
    const selectedId = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
    const selectedTitle = msg.message.listResponseMessage?.title
    console.log('List selected:', selectedId, '|', selectedTitle)
    return
  }

  if (type === 'buttonsResponseMessage') {
    const selectedId = msg.message.buttonsResponseMessage?.selectedButtonId
    const displayText = msg.message.buttonsResponseMessage?.selectedDisplayText
    console.log('Button selected:', selectedId, '|', displayText)
    return
  }
})
```

---

## Modify Messages

```js
const sent = await sock.sendMessage(jid, { text: 'Original text' })

await sock.sendMessage(jid, { text: 'Corrected text', edit: sent.key })

await sock.sendMessage(jid, { delete: msg.key })

await sock.sendMessage(jid, { pin: sent.key, type: 1 })
await sock.sendMessage(jid, { pin: sent.key, type: 2 })

await sock.sendMessage(jid, { keep: msg.key, type: 1 })
```

---

## Media Handling

```js
const { downloadMediaMessage } = require('@lunarianbyte/baileys')
const fs = require('fs')

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (!msg.message) return

  const type = getContentType(msg.message)
  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']

  if (mediaTypes.includes(type)) {
    const buffer = await downloadMediaMessage(msg, 'buffer', {})
    fs.writeFileSync('./downloads/media', buffer)

    const stream = await downloadMediaMessage(msg, 'stream', {})
    stream.pipe(fs.createWriteStream('./downloads/stream-file'))

    console.log('Downloaded', type, 'size:', buffer.length, 'bytes')
  }
})
```

---

## Read Receipts

```js
await sock.readMessages([msg.key])

await sock.readMessages([
  { id: 'MSG_ID_1', remoteJid: jid, fromMe: false },
  { id: 'MSG_ID_2', remoteJid: jid, fromMe: false }
])
```

---

## Reject Call

```js
sock.ev.on('call', async (calls) => {
  for (const call of calls) {
    if (call.status === 'offer') {
      await sock.rejectCall(call.id, call.from)
    }
  }
})
```

---

## Presence

```js
await sock.sendPresenceUpdate('available')
await sock.sendPresenceUpdate('unavailable')
await sock.sendPresenceUpdate('composing', jid)
await sock.sendPresenceUpdate('paused', jid)
await sock.sendPresenceUpdate('recording', jid)

await sock.presenceSubscribe(jid)

sock.ev.on('presence.update', ({ id, presences }) => {
  for (const [participant, presence] of Object.entries(presences)) {
    console.log(participant, 'is', presence.lastKnownPresence)
    if (presence.lastSeen) console.log('Last seen:', new Date(presence.lastSeen * 1000))
  }
})
```

---

## Chat Modification

```js
await sock.chatModify(
  { archive: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)

await sock.chatModify({ pin: true }, jid)
await sock.chatModify({ pin: false }, jid)

await sock.chatModify({ mute: Date.now() + 8 * 60 * 60 * 1000 }, jid)
await sock.chatModify({ mute: null }, jid)

await sock.chatModify(
  { markRead: false, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)

await sock.chatModify(
  { delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)

await sock.star(jid, [{ id: msg.key.id, fromMe: !!msg.key.fromMe }], true)
await sock.star(jid, [{ id: msg.key.id, fromMe: !!msg.key.fromMe }], false)

await sock.sendMessage(jid, { disappearingMessagesInChat: true })
await sock.sendMessage(jid, { disappearingMessagesInChat: false })
await sock.sendMessage(jid, { disappearingMessagesInChat: 86400 })
```

---

## User Queries

```js
const [result] = await sock.onWhatsApp('628xxxxxxxxx@s.whatsapp.net')
console.log(result?.exists, result?.lid)

const results = await sock.onWhatsApp('628111111111@s.whatsapp.net', '628222222222@s.whatsapp.net')
results.forEach(r => console.log(r.jid, r.exists))

const statuses = await sock.fetchStatus(jid)
console.log(statuses?.[0]?.status)

const durations = await sock.fetchDisappearingDuration(jid)

const props = await sock.fetchProps()
console.log('Web props:', props)
// useful for checking account/web capability flags (varies by account)

const previewUrl = await sock.profilePictureUrl(jid, 'preview')
const fullUrl = await sock.profilePictureUrl(jid, 'image')

await sock.addOrEditContact(jid, { notify: 'John Doe' })
await sock.removeContact(jid)

// resolve PN ↔ LID bidirectionally
const ids = await sock.findUserId('628xxxxxxxxx@s.whatsapp.net')
console.log(ids.phoneNumber, ids.lid)

const ids2 = await sock.findUserId('43411111111111@lid')
console.log(ids2.phoneNumber, ids2.lid)
// { phoneNumber: '628xxx@s.whatsapp.net', lid: '434xxx@lid' }
// { phoneNumber: 'id-not-found', lid: '434xxx@lid' }  <- when not resolvable
```

---

## Profile

```js
const fs = require('fs')

await sock.updateProfileName('lunarianbyte/baileys Bot')
await sock.updateProfileStatus('Running on @lunarianbyte/baileys')
await sock.updateProfilePicture(sock.authState.creds.me.id, fs.readFileSync('./avatar.jpg'))
await sock.updateProfilePicture(groupJid, fs.readFileSync('./group-icon.jpg'))
await sock.removeProfilePicture(sock.authState.creds.me.id)
```

---

## Privacy Settings

```js
await sock.updateLastSeenPrivacy('contacts')
await sock.updateOnlinePrivacy('match_last_seen')
await sock.updateProfilePicturePrivacy('contacts')
await sock.updateStatusPrivacy('contacts')
await sock.updateReadReceiptsPrivacy('all')
await sock.updateGroupsAddPrivacy('contacts')
await sock.updateMessagesPrivacy('all')
await sock.updateCallPrivacy('contacts')
await sock.updateDefaultDisappearingMode(604800)
await sock.updateDisableLinkPreviewsPrivacy(true)
```

---

## Block / Unblock

```js
const blocklist = await sock.fetchBlocklist()
await sock.updateBlockStatus('628xxxxxxxxx@s.whatsapp.net', 'block')
await sock.updateBlockStatus('628xxxxxxxxx@s.whatsapp.net', 'unblock')
```

---

## Groups

```js
const group = await sock.groupCreate('My Group', [
  '628111111111@s.whatsapp.net',
  '628222222222@s.whatsapp.net'
])
console.log('Group JID:', group.id)

await sock.groupLeave(groupJid)

await sock.groupUpdateSubject(groupJid, 'New Group Name')
await sock.groupUpdateDescription(groupJid, 'New description.')
await sock.groupUpdateDescription(groupJid, null)

await sock.groupParticipantsUpdate(groupJid, ['628xxx@s.whatsapp.net'], 'add')
await sock.groupParticipantsUpdate(groupJid, ['628xxx@s.whatsapp.net'], 'remove')
await sock.groupParticipantsUpdate(groupJid, ['628xxx@s.whatsapp.net'], 'promote')
await sock.groupParticipantsUpdate(groupJid, ['628xxx@s.whatsapp.net'], 'demote')

const code = await sock.groupInviteCode(groupJid)
const newCode = await sock.groupRevokeInvite(groupJid)
const joinedJid = await sock.groupAcceptInvite('INVITE_CODE')
const info = await sock.groupGetInviteInfo('INVITE_CODE')

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (msg.message?.groupInviteMessage) {
    await sock.groupAcceptInviteV4(msg.key, msg.message.groupInviteMessage)
  }
})

await sock.groupRevokeInviteV4(groupJid, '628xxx@s.whatsapp.net')

await sock.groupJoinApprovalMode(groupJid, 'on')
const requests = await sock.groupRequestParticipantsList(groupJid)
await sock.groupRequestParticipantsUpdate(groupJid, ['628xxx@s.whatsapp.net'], 'approve')
await sock.groupRequestParticipantsUpdate(groupJid, ['628xxx@s.whatsapp.net'], 'reject')

await sock.groupSettingUpdate(groupJid, 'announcement')
await sock.groupSettingUpdate(groupJid, 'not_announcement')
await sock.groupSettingUpdate(groupJid, 'locked')
await sock.groupSettingUpdate(groupJid, 'unlocked')

await sock.groupMemberAddMode(groupJid, 'all_member_add')

await sock.groupToggleEphemeral(groupJid, 604800)
await sock.groupToggleEphemeral(groupJid, 86400)
await sock.groupToggleEphemeral(groupJid, 0)

const meta = await sock.groupMetadata(groupJid)
console.log(meta.id, meta.subject, meta.desc, meta.participants.length)

const groups = await sock.groupFetchAllParticipating()
for (const [jid, meta] of Object.entries(groups)) {
  console.log(meta.subject, jid)
}
```

---

## Community

```js
const community = await sock.communityCreate('My Community', 'Welcome!')

const meta = await sock.communityMetadata(communityJid)

await sock.communityUpdateSubject(communityJid, 'New Name')
await sock.communityUpdateDescription(communityJid, 'New description.')

await sock.communityCreateGroup('Study Room', ['628xxx@s.whatsapp.net'], communityJid)

await sock.communityLinkGroup(existingGroupJid, communityJid)
await sock.communityUnlinkGroup(existingGroupJid, communityJid)

const { linkedGroups } = await sock.communityFetchLinkedGroups(communityJid)

await sock.communityParticipantsUpdate(communityJid, ['628xxx@s.whatsapp.net'], 'add')
await sock.communityParticipantsUpdate(communityJid, ['628xxx@s.whatsapp.net'], 'remove')

const cCode = await sock.communityInviteCode(communityJid)
await sock.communityRevokeInvite(communityJid)

const reqs = await sock.communityRequestParticipantsList(communityJid)
await sock.communityRequestParticipantsUpdate(communityJid, ['628xxx@s.whatsapp.net'], 'approve')

await sock.communityLeave(communityJid)
```

---

## Newsletter / Channel

```js
const fs = require('fs')

const newsletter = await sock.newsletterCreate(
  'My Channel',
  'Latest updates',
  fs.readFileSync('./logo.jpg')
)
console.log('Newsletter JID:', newsletter.id)

await sock.newsletterDelete(newsletter.id)

await sock.newsletterUpdateName(newsletter.id, 'New Channel Name')
await sock.newsletterUpdateDescription(newsletter.id, 'Updated description.')
await sock.newsletterUpdatePicture(newsletter.id, fs.readFileSync('./logo.jpg'))
await sock.newsletterRemovePicture(newsletter.id)

await sock.newsletterFollow(newsletter.id)
await sock.newsletterUnfollow(newsletter.id)
await sock.newsletterMute(newsletter.id)
await sock.newsletterUnmute(newsletter.id)

await sock.subscribeNewsletterUpdates(newsletter.id)

const meta = await sock.newsletterMetadata('JID', newsletter.id)
console.log(meta.name, meta.subscribers, meta.verification)

const count = await sock.newsletterAdminCount(newsletter.id)

await sock.newsletterChangeOwner(newsletter.id, '628xxx@s.whatsapp.net')
await sock.newsletterDemote(newsletter.id, '628xxx@s.whatsapp.net')

await sock.newsletterReactionMode(newsletter.id, 'all')
await sock.newsletterReactionMode(newsletter.id, 'basic')
await sock.newsletterReactionMode(newsletter.id, 'none')

const messages = await sock.newsletterFetchMessages('jid', newsletter.id, 10)
for (const item of messages) {
  console.log('Server ID:', item.server_id, 'Views:', item.views)
}

const updates = await sock.newsletterFetchUpdates(newsletter.id, 10)

await sock.newsletterReactMessage(newsletter.id, 'SERVER_ID', 'x')
await sock.newsletterReactMessage(newsletter.id, 'SERVER_ID', null)

const inviteMeta = await sock.newsletterId('https://whatsapp.com/channel/0029Va9vcYKGgYKQNc8wUd')
console.log('Newsletter ID:', inviteMeta.id, inviteMeta.name)

const subscribed = await sock.newsletterSubscribed()
for (const ch of subscribed) {
  console.log(ch.id, ch.name)
}

await sock.sendMessage('1203630xxxxxxxx@newsletter', {
  video: { url: 'https://a.top4top.io/m_3706zd9k00.mp4' },
  caption: 'jawa banget',
  streamingSidecar: 'QD4XJIMi3ARGTYV8zNWRfNX05nc//e7lxshUO2RH/NuhA7tkg5ew/vPfKOFtIrTt/+E=',
  annotations: [
    {
      embeddedContent: {
        embeddedMusic: {
          musicContentMediaId: '12',
          songId: '11',
          author: 'Shinaru',
          title: 'Oryta Community',
          artistAttribution: 'https://github.com/sh1njs/Katsumi'
        }
      },
      embeddedAction: true
    }
  ]
})
```

---

## Business Profile

```js
const profile = await sock.getBusinessProfile('628xxx@s.whatsapp.net')
console.log(profile?.address, profile?.email, profile?.description)

await sock.updateBusinessProfile({
  address: '123 Main Street, Jakarta',
  email: 'contact@mybusiness.com',
  description: 'Official WhatsApp Business account.',
  websites: ['https://mybusiness.com'],
  hours: {
    timezone: 'Asia/Jakarta',
    days: [
      { day: 'MON', mode: 'specific_hours', openTimeInMinutes: 540, closeTimeInMinutes: 1080 },
      { day: 'SAT', mode: 'open_24h' },
      { day: 'SUN', mode: 'closed' }
    ]
  }
})

await sock.updateCoverPhoto(fs.readFileSync('./cover.jpg'))
await sock.removeCoverPhoto()
```

> Compatibility: `sock.updateBussinesProfile(...)` remains available as a legacy alias.

---

## Labels

```js
await sock.addChatLabel(jid, 'LABEL_ID')
await sock.removeChatLabel(jid, 'LABEL_ID')
await sock.addMessageLabel(jid, msg.key.id, 'LABEL_ID')
await sock.removeMessageLabel(jid, msg.key.id, 'LABEL_ID')

await sock.addOrEditQuickReply({
  shortcut: 'hello',
  message: 'Hello! How can I help you?',
  timestamp: Date.now()
})
await sock.removeQuickReply(timestamp)

await sock.updateMemberLabel(groupJid, 'Custom Member Tag')
```

---

## Bot Features

```js
const bots = await sock.getBotListV2()
console.log(bots)

await sock.sendMessage(jid, {
  text: 'What is the weather today?',
  ai: true
})
```

---

## Call Link

```js
const token = await sock.createCallLink('video')
console.log('Video call link token:', token)

const audioToken = await sock.createCallLink('audio')

const eventToken = await sock.createCallLink('video', {
  startTime: Math.floor(Date.now() / 1000) + 3600
})
```

---

## Custom WS Callbacks

```js
const pino = require('pino')
const sock = makeWASocket({
  logger: pino({ level: 'debug' })
})

sock.ws.on('CB:edge_routing', (node) => console.log('Edge routing:', node))
sock.ws.on('CB:iq', (node) => console.log('IQ received:', node.attrs))
sock.ws.on('CB:call', (node) => console.log('Call node:', node))
```

---

---

## Feature Comparison

| Feature | Status | Notes |
|---|---|---|
| Text Messages | yes | extended with link preview |
| Media (Image, Video, Audio, Document) | yes | with compression and thumbnails |
| Stickers | yes | regular, Lottie, Avatar |
| Reactions | yes | on any message type |
| Polls | yes | V1, V2, V3 with vote tracking |
| Buttons / Interactive | yes | buttons, buttonsMessage (legacy), list, native flow, carousel, pix/pay |
| Event Message | yes | |
| Poll Result Message | yes | |
| Group Status Message | yes | |
| Album / Collection | yes | multiple media grouped |
| Carousel | yes | multi-card scrollable |
| externalAdReply shorthand | yes | folds into contextInfo.externalAdReply |
| Payment Request | yes *(WA Web only)* | with background support |
| Group Management | yes | create, manage, settings |
| Communities | yes | create, link groups |
| Business Features | yes | profile, catalog, products |
| Newsletter / Channels | yes | create, manage, analytics |
| newsletterId(url) | yes | get newsletter info from invite URL |
| newsletterSubscribed() | yes | list all followed newsletters |
| findUserId(jid) | yes | bidirectional JID ↔ LID resolution |
| Contact Management | yes | lookup, verification |
| Profile Features | yes | update, privacy controls |
| Privacy Settings | yes | all major categories |
| Message Editing | yes | |
| Message Deletion | yes | |
| Disappearing Messages | yes | |
| Status / Stories | yes | including mentions |
| Multi-Device | yes | QR and pairing code |
| History Sync | yes | |
| SQLite Auth State | yes | |
| Custom Auth State | yes | Redis, MongoDB, etc. |
| LID Support | yes | modern identity system |
| Encryption | yes | Signal protocol *(libsignal node usage `@rexxhayanasi/elaina-libsignal`)* |
| Auto-Updates | yes | version tracking system |
| viewOnceV2 / viewOnceV2Extension wrappers | yes | flag on sendMessage |
| ephemeral wrapper flag | yes | wraps any message in ephemeralMessage |
| groupStatus wrapper flag | yes | wraps any message in groupStatusMessage |
| interactiveAsTemplate flag | yes | wraps interactiveMessage in templateMessage |
| secureMetaServiceLabel flag | yes | adds label to contextInfo |
| raw flag | yes | pass raw proto structure directly |
| requestPaymentFrom shorthand | yes *(WA Web only)* | simple payment request with text |
| invoiceNote shorthand | yes | invoice with media attachment |
| orderText shorthand | yes | order message with thumbnail |
| paymentInviteServiceType shorthand | yes *(WA Web only)* | payment invite (GPay/PhonePe/Meta) |
| externalAdReply normalization | yes | thumbnail/largeThumbnail/url shortcuts |

---

<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="100%">
