# Baileys-jawa - Message Sending Documentation

## sendMessage Usage

```ts
await sock.sendMessage(jid, content, options?)
```

- `jid` - target chat ID (e.g., `628xxx@s.whatsapp.net` or `group@g.us`)
- `content` - message content object (see types below)
- `options` - optional: `quoted`, `ephemeralExpiration`, `timestamp`, `backgroundColor`, `font`, `statusJidList`, `mediaUploadTimeoutMs`, `broadcast`

---

## Message Content Types

### Plain Text

```ts
await sock.sendMessage(jid, { text: 'Hello!' })

// With link preview
await sock.sendMessage(jid, {
  text: 'Check this https://example.com',
  linkPreview: null // set to null to disable auto link preview
})

// With mentions
await sock.sendMessage(jid, {
  text: 'Hello @628xxx',
  mentions: ['628xxx@s.whatsapp.net']
})

// With backgroundColor (status)
await sock.sendMessage(jid, {
  text: 'Status text',
  backgroundColor: '#FF0000'
})
```

### Media Messages

```ts
// Image
await sock.sendMessage(jid, {
  image: { url: 'https://example.com/image.jpg' },
  caption: 'Image caption'
})

// Video
await sock.sendMessage(jid, {
  video: { url: 'https://example.com/video.mp4' },
  caption: 'Video caption',
  gifPlayback: true // send as GIF
})

// Audio
await sock.sendMessage(jid, {
  audio: { url: 'https://example.com/audio.mp3' },
  ptt: true // send as voice note
})

// Document
await sock.sendMessage(jid, {
  document: { url: 'https://example.com/doc.pdf' },
  fileName: 'document.pdf',
  mimetype: 'application/pdf',
  caption: 'Document caption'
})

// Sticker
await sock.sendMessage(jid, {
  sticker: { url: 'https://example.com/sticker.webp' }
})
```

### Contact

```ts
await sock.sendMessage(jid, {
  contacts: {
    displayName: 'John',
    contacts: [{
      vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:John\nEND:VCARD'
    }]
  }
})
```

### Location

```ts
await sock.sendMessage(jid, {
  location: {
    degreesLatitude: -6.2088,
    degreesLongitude: 106.8456,
    name: 'Location Name'
  }
})
```

### Poll

```ts
await sock.sendMessage(jid, {
  poll: {
    name: 'Favorite color?',
    values: ['Red', 'Blue', 'Green'],
    selectableCount: 1,
    toAnnouncementGroup: false // true for community groups
  }
})
```

### Event (Calendar)

```ts
await sock.sendMessage(jid, {
  event: {
    name: 'Meeting',
    description: 'Team meeting',
    startDate: new Date('2025-01-01T10:00:00Z'),
    endDate: new Date('2025-01-01T11:00:00Z'),
    location: { degreesLatitude: 0, degreesLongitude: 0 },
    isCancelled: false
  }
})
```

### Reaction

```ts
await sock.sendMessage(jid, {
  react: {
    key: message.key,
    text: '👍'
  }
})
```

### Delete / Revoke

```ts
await sock.sendMessage(jid, {
  delete: message.key
})
```

### Edit Message

```ts
await sock.sendMessage(jid, {
  text: 'Edited message',
  edit: message.key
})
```

### Pin Message

```ts
await sock.sendMessage(jid, {
  pin: message.key,
  type: 1, // 1 = pin, 2 = unpin ??
  time: 86400 // 86400 (24h), 604800 (7d), 2592000 (30d)
})
```

### Forward Message

```ts
await sock.sendMessage(jid, {
  forward: originalMessage,
  force: false // true = always show as forwarded
})
```

### Album (Media Album)

```ts
await sock.sendMessage(jid, {
  album: {
    expectedImageCount: 2,
    expectedVideoCount: 0
  }
})

// Then send individual media with albumParentKey
const albumMsg = await sock.sendMessage(jid, { album: { expectedImageCount: 2 } })
await sock.sendMessage(jid, {
  image: { url: 'https://...' },
  albumParentKey: albumMsg.key
})
await sock.sendMessage(jid, {
  image: { url: 'https://...' },
  albumParentKey: albumMsg.key
})
```

### Share/Request Phone Number

```ts
await sock.sendMessage(jid, { sharePhoneNumber: true })
await sock.sendMessage(jid, { requestPhoneNumber: true })
```

---

## Interactive Button Types

### Interactive Buttons (NativeFlow - Modern)

NativeFlow buttons are the modern WhatsApp interactive button format. They use a JSON string for parameters.

```ts
await sock.sendMessage(jid, {
  text: 'Choose an option:',
  interactiveButtons: [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: 'Button 1',
        id: 'btn-1'
      })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: 'Button 2',
        id: 'btn-2'
      })
    }
  ],
  title: 'Title Text',
  footer: 'Footer Text'
})
```

**Supported button `name` types:**

| name | description | params |
|------|-------------|--------|
| `quick_reply` | Simple reply button | `display_text`, `id` |
| `url_button` | Opens a URL | `display_text`, `url` |
| `call_button` | Initiates a phone call | `display_text`, `phone_number` |
| `copy_button` | Copies text to clipboard | `display_text`, `copy_code` |
| `payment` | Payment button | `display_text`, `amount`, `currency`, `merchant_name`, `reference_id` |
| `send_location` | Sends location | `display_text` |

**With image/video media:**

```ts
await sock.sendMessage(jid, {
  image: { url: 'https://example.com/image.jpg' },
  caption: 'Check this out!',
  interactiveButtons: [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: 'Like', id: 'like' })
    },
    {
      name: 'url_button',
      buttonParamsJson: JSON.stringify({ display_text: 'Visit', url: 'https://example.com' })
    }
  ],
  title: 'Media Title',
  footer: 'Footer text'
})
```

**Combined with mentions:**

```ts
await sock.sendMessage(jid, {
  text: 'Hello @628xxx',
  mentions: ['628xxx@s.whatsapp.net'],
  interactiveButtons: [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: 'Reply', id: 'reply' })
    }
  ]
})
```

### Legacy Buttons (ButtonsMessage)

Older-style buttons that embed directly in the message. Supports text and media headers.

```ts
// With text
await sock.sendMessage(jid, {
  text: 'Hello!',
  buttons: [
    {
      buttonText: { displayText: 'Option 1' }
    },
    {
      buttonText: { displayText: 'Option 2' }
    }
  ],
  title: 'Title',
  footer: 'Footer'
})

// With media
await sock.sendMessage(jid, {
  image: { url: 'https://example.com/image.jpg' },
  caption: 'Check this',
  buttons: [
    {
      buttonText: { displayText: 'View' }
    }
  ],
  footer: 'Footer'
})

// With NativeFlow info
await sock.sendMessage(jid, {
  text: 'Payment:',
  buttons: [
    {
      buttonText: { displayText: 'Pay Now' },
      nativeFlowInfo: {
        name: 'pay_now',
        paramsJson: JSON.stringify({ amount: '10000' })
      }
    }
  ]
})
```

### Template Buttons (TemplateMessage)

Hydrated template buttons with URL, call, and quick reply actions.

```ts
await sock.sendMessage(jid, {
  text: 'Welcome!',
  templateButtons: [
    {
      index: 0,
      urlButton: {
        displayText: 'Visit Website',
        url: 'https://example.com'
      }
    },
    {
      index: 1,
      callButton: {
        displayText: 'Call Us',
        phoneNumber: '+628123456789'
      }
    },
    {
      index: 2,
      quickReplyButton: {
        displayText: 'Reply',
        id: 'reply-id'
      }
    }
  ],
  footer: 'Footer text'
})
```

### List Message (Sections)

Interactive list with multiple sections and rows.

```ts
await sock.sendMessage(jid, {
  text: 'Select from menu:',
  sections: [
    {
      title: 'Food',
      rows: [
        { title: 'Pizza', description: 'Cheese pizza', rowId: 'food-pizza' },
        { title: 'Burger', description: 'Beef burger', rowId: 'food-burger' }
      ]
    },
    {
      title: 'Drinks',
      rows: [
        { title: 'Coffee', description: 'Hot coffee', rowId: 'drink-coffee' },
        { title: 'Tea', description: 'Green tea', rowId: 'drink-tea' }
      ]
    }
  ],
  buttonText: 'Choose Menu', // button text to open the list
  title: 'Title',
  footer: 'Footer'
})
```

### Shop Message (InteractiveMessage - Shop)

Interactive storefront message.

```ts
await sock.sendMessage(jid, {
  text: 'Check our store:',
  shop: 3, // WA surface (3 = WhatsApp)
  id: 'shop-id'
})
```

---

## Common Options

### Quoting / Reply

```ts
await sock.sendMessage(jid, { text: 'Reply' }, {
  quoted: receivedMessage
})
```

### Disappearing Messages

```ts
// Set chat to disappearing messages (7 days)
await sock.sendMessage(jid, { disappearingMessagesInChat: 7 * 24 * 3600 })

// Or use boolean (default WA_DEFAULT_EPHEMERAL = 7 days)
await sock.sendMessage(jid, { disappearingMessagesInChat: true })

// Send a single disappearing message
await sock.sendMessage(jid, { text: 'This will disappear' }, {
  ephemeralExpiration: 86400 // 24 hours in seconds
})
```

### Custom Timestamp

```ts
await sock.sendMessage(jid, { text: 'Old message' }, {
  timestamp: new Date('2024-01-01')
})
```

### Broadcast (Status)

```ts
await sock.sendMessage('status@broadcast', {
  text: 'My status',
  backgroundColor: '#FF0000',
  font: 1
}, {
  statusJidList: ['628xxx@s.whatsapp.net'] // viewers who can see
})
```

---

---

## Chat Modification

Modify chat properties like archive, pin, mute, mark as read, delete, star messages, and more.

### Archive / Unarchive

```ts
await sock.chatModify(
  { archive: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)

await sock.chatModify(
  { archive: false, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)
```

### Pin / Unpin

```ts
await sock.chatModify({ pin: true }, jid)
await sock.chatModify({ pin: false }, jid)
```

### Mute / Unmute

```ts
// Mute for 8 hours
await sock.chatModify({ mute: Date.now() + 8 * 60 * 60 * 1000 }, jid)

// Unmute (pass null to unmute)
await sock.chatModify({ mute: null }, jid)

// Mute forever
await sock.chatModify({ mute: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000 }, jid)
```

### Mark as Read / Unread

```ts
// Mark as read
await sock.chatModify(
  { markRead: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)

// Mark as unread
await sock.chatModify(
  { markRead: false, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)
```

### Delete Chat

```ts
await sock.chatModify(
  { delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)
```

### Clear Chat

```ts
await sock.chatModify(
  { clear: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
  jid
)
```

### Delete Message for Me

```ts
await sock.chatModify({
  deleteForMe: {
    deleteMedia: false, // also delete media?
    key: msg.key,
    timestamp: Date.now()
  }
}, jid)
```

### Star / Unstar Messages

```ts
// Star a message
await sock.star(jid, [{ id: msg.key.id, fromMe: !!msg.key.fromMe }], true)

// Unstar a message
await sock.star(jid, [{ id: msg.key.id, fromMe: !!msg.key.fromMe }], false)

// Star multiple messages at once
await sock.star(jid, [
  { id: msg1.key.id, fromMe: true },
  { id: msg2.key.id, fromMe: false }
], true)
```

### Contact Management

```ts
// Add or edit contact
await sock.addOrEditContact(jid, {
  firstName: 'John',
  fullName: 'John Doe'
})

// Remove contact
await sock.removeContact(jid)
```

### Label Management

```ts
// Add label to chat
await sock.addChatLabel(jid, 'label-id')

// Remove label from chat
await sock.removeChatLabel(jid, 'label-id')

// Add label to specific message
await sock.addMessageLabel(jid, 'message-id', 'label-id')

// Remove label from message
await sock.removeMessageLabel(jid, 'message-id', 'label-id')
```

### Quick Reply

```ts
// Add or edit quick reply
await sock.addOrEditQuickReply({
  shortcut: 'hi',
  message: 'Hello! How can I help you?',
  count: 0
})

// Remove quick reply
await sock.removeQuickReply('timestamp')
```

### Disappearing Messages (via sendMessage)

```ts
// Enable disappearing messages (default duration: 7 days)
await sock.sendMessage(jid, { disappearingMessagesInChat: true })

// Disable disappearing messages
await sock.sendMessage(jid, { disappearingMessagesInChat: false })

// Set custom duration (in seconds)
await sock.sendMessage(jid, { disappearingMessagesInChat: 86400 })   // 24 hours
await sock.sendMessage(jid, { disappearingMessagesInChat: 604800 })  // 7 days
await sock.sendMessage(jid, { disappearingMessagesInChat: 7776000 }) // 90 days
```

### Link Previews Privacy

```ts
// Disable link previews (privacy setting)
await sock.updateDisableLinkPreviewsPrivacy(true)

// Enable link previews
await sock.updateDisableLinkPreviewsPrivacy(false)
```

---

## Button Response Handling

Listen for button responses via events:

```ts
// Interactive button response (NativeFlow)
sock.ev.on('messages.upsert', ({ messages }) => {
  const msg = messages[0]
  if (msg.message?.interactiveResponseMessage) {
    const response = msg.message.interactiveResponseMessage
    console.log('Button response:', {
      name: response.nativeFlowResponseMessage?.name,
      params: JSON.parse(response.nativeFlowResponseMessage?.paramsJson || '{}')
    })
  }
})

// Legacy button response
sock.ev.on('messages.upsert', ({ messages }) => {
  const msg = messages[0]
  if (msg.message?.buttonsResponseMessage) {
    console.log('Button:', msg.message.buttonsResponseMessage.selectedButtonId)
  }
})

// List response
sock.ev.on('messages.upsert', ({ messages }) => {
  const msg = messages[0]
  if (msg.message?.listResponseMessage) {
    console.log('Selected:', msg.message.listResponseMessage.singleSelectReply?.selectedRowId)
  }
})
```

---

## TypeScript Types

```ts
import type {
  InteractiveButton,
  AnyMessageContent,
  AnyRegularMessageContent,
  AnyMediaMessageContent
} from 'baileys'

// InteractiveButton structure
interface InteractiveButton {
  name: string        // 'quick_reply' | 'url_button' | 'call_button' | 'copy_button' | 'payment'
  buttonParamsJson: string  // JSON string with button params
}
```

All message content types support these optional modifiers:

```ts
type MessageModifiers = {
  mentions?: string[]           // JIDs to mention
  mentionAll?: boolean          // Mention @all in group
  contextInfo?: proto.IContextInfo  // Additional context info
  viewOnce?: boolean            // View-once message
  edit?: WAMessageKey           // Edit existing message
  albumParentKey?: WAMessageKey // Associate with parent album
}
```
