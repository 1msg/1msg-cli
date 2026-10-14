# 1msg CLI — design (1MSG-164)

Third client for the public 1msg API, after [`@1msg/sdk`](./SDK.md) and [`@1msg/mcp`](./MCP.md). **The product is the full public API, not an MVP.** `--help` below is the acceptance artifact: every public `operationId` except `deleteMediaLegacy` has a command. Nothing prints `not implemented yet`.

| | |
|--|--|
| **Binary** | `1msg` |
| **npm** | [`@1msg/cli`](https://www.npmjs.com/package/@1msg/cli) |
| **HTTP** | `@1msg/sdk` only — same invariant as MCP |
| **Coverage** | 61 of 62 public operations (legacy `deleteMediaLegacy` is not exposed) |
| **Hosts** | `https://api.1msg.io` (live) · `https://sandbox.1msg.io` (test) |
| **Distribution repo** | [`1msg/1msg-cli`](https://github.com/1msg/1msg-cli) (public; preferred for npx/clone) |

> **Distribution:** For `npx @1msg/cli` and clone, use [`1msg/1msg-cli`](https://github.com/1msg/1msg-cli). This monorepo package (`packages/cli`) remains the implementation home. Commands are hand-mapped, not generated from OpenAPI.

CLI language is English. Complex bodies (`template add`, interactive messages, calling SDP) take flags for scalars and `--from-file` for JSON.

---

## Help (acceptance artifact)

### `1msg --help`

```
1msg — command-line client for the 1msg WhatsApp Business API

USAGE
  1msg <command> [flags]

A channel is one WhatsApp instance (instance id + token). Commands use the
default channel from the config file unless --channel is set. Environment
variables fill empty fields on that channel; they do not override a named
channel that already has a value.

COMMANDS
  init          Interactive setup: config file, API host, instance, token
  send          Send a text or file message (alias of message send)
  message       Send, list, and mark messages
  template      List, send, create, and delete message templates
  channel       Local channel switcher; remote status and settings
  me            WhatsApp Business profile (GET/POST /me)
  status        Connection status (alias of channel status)
  media         Upload, fetch, and delete WABA media
  group         Create and manage WhatsApp groups
  flow          WhatsApp Flows and business encryption key
  webhook       Get or set the client webhook URL
  user          Block, unblock, and list blocked users
  catalog       Catalog and cart commerce settings
  call          WhatsApp Calling API (beta, signaling only)
  completion    Print shell completion script (bash | zsh | powershell)
  version       Print CLI and SDK versions

FLAGS
  -c, --channel <name>     Named channel from the config file
      --instance-id <id>   Override instance id
      --base-url <url>     Override API root
      --token <token>      Override token (prefer ONE_MSG_TOKEN)
      --json               Print the API response body as JSON
      --no-color           Disable ANSI color
  -h, --help               Help for this command
  -v, --version            Version

EXAMPLES
  $ 1msg init
  $ 1msg channel list
  $ 1msg channel use acme-prod
  $ 1msg channel use ODI371267300
  $ 1msg channel info
  $ 1msg channel info --json
  $ 1msg send --to 12020721369 --text "Hello"
  $ 1msg send --to 12020721369 --file ./invoice.pdf --caption "Invoice"
  $ 1msg template list
  $ 1msg status --json
  $ 1msg message list --chat-id 12020721369@c.us --limit 20

ENVIRONMENT
  ONE_MSG_CHANNEL        Same as --channel
  ONE_MSG_BASE_URL       https://api.1msg.io or https://sandbox.1msg.io
  ONE_MSG_INSTANCE_ID    Channel instance id
  ONE_MSG_TOKEN          Channel API token

  Deprecated aliases (same as MCP): CHAT_API_BASE_URL, CHAT_API_TOKEN,
  CHAT_API_INSTANCE_ID, CHAT_API_KEY, TOKEN, INSTANCE_ID.

Config: ~/.config/1msg/config.yaml  (Windows: %AppData%\1msg\config.yaml)
Docs:   https://docs.1msg.io/
```

`--json` is the raw API body (ticket: clean server JSON). Default output is a table / key-value. There is no `--raw`. The one CLI-built object is `channel info --json`: `{ "status": <GET /status>, "me": <GET /me> }`.

### Shared destination flags

Used by send-like commands unless a command says otherwise.
Exactly one of `--to` or `--chat-id`. Exception: `message payment` is `--to` only
(public schema has no `chatId`).

```
      --to <phone>             Phone with country code, no +
      --chat-id <id>           phone@c.us | group@g.us | BSUID@lid
      --quote <wamid>          Reply to this message (wamid.*)
```

### Human tables (list commands)

Default output (no `--json`) is a table. Column names are stable. Extra API
fields are omitted from the table and appear only with `--json`.

| Command | Columns | Notes |
|---|---|---|
| `channel list` | `default`, `name`, `instance_id`, `base_url` | Local config. `default` is `*` or empty. Never `token`. |
| `message list` | `time`, `chat_id`, `from`, `type`, `id`, `body` | `body` truncated to 60 chars. If API returns `notice` and no rows, print the notice and exit 0. |
| `template list` | `name`, `status`, `language`, `category`, `id` | From normalized `{total, templates[]}`. Footer line: `total N`. |
| `group list` | `id`, `subject` | WABA group id without `@g.us` in `id`. |
| `flow list` | `id`, `name`, `status`, `categories` | `categories` joined with comma. HTTP 501: print API error. |
| `user blocked` | `phone` | First present of `phone`, `wa_id`, `id`. |
| `catalog get` | `id`, `cart`, `visible` | `cart`/`visible` are `true`/`false` from `is_cart_enabled` / `is_catalog_visible`. |
| `channel settings` | key-value, one setting per line | Not a multi-row table. |
| `me` | key-value (`about`, `phone`, `email`, …) | Not a multi-row table. |
| `status` | key-value (`status`, `accountStatus`, `mm_lite_available`) | Not a multi-row table. |

Empty list: print `No rows.` to stderr and exit 0.

### `1msg init --help`

```
Create a config file and register the first channel.

USAGE
  1msg init [flags]

FLAGS
      --name <name>            Channel name in the config file (default: default)
      --base-url <url>         https://api.1msg.io or https://sandbox.1msg.io
                               (also api-stage.1msg.io / http://127.0.0.1:3050)
      --instance-id <id>       Channel instance id
      --token-stdin            Read token from stdin (non-interactive)
      --no-verify              Skip GET /status after save
  -h, --help

EXAMPLES
  $ 1msg init
  $ printf '%s' "$ONE_MSG_TOKEN" | 1msg init --name prod \
      --base-url https://api.1msg.io --instance-id ODI371267300 --token-stdin

Interactive prompts: name, live vs sandbox, instance id, token (hidden),
set as default. Writes the config file with mode 0600 and runs 1msg status
unless --no-verify.
```

### `1msg channel --help`

```
Local named channels, and remote status/settings of the selected channel.

USAGE
  1msg channel <command> [flags]

There is no API to list a customer's channels. list / use / add / remove /
current are always local. Other subcommands call the public API.

LOCAL
  list                 Channels in the config file (* = default)
  use <name|id>        Set the default channel (see `1msg channel use --help`)
  add                  Add a channel (see `1msg channel add --help`)
  remove <name>        Remove a channel from the config file
  current              Print the default channel name and instance id

REMOTE
  info                 GET /status + GET /me (human summary, or one JSON object)
  status               GET /status
  settings             GET /settings
  settings set         POST /settings (only flags you pass are sent)
  mm-lite              GET /mmLiteStatus
  automation           GET /conversationalAutomation
  automation set       POST /conversationalAutomation

EXAMPLES
  $ 1msg channel add --name acme-test --base-url https://sandbox.1msg.io \
      --instance-id ODI… --token-stdin
  $ 1msg channel use acme-test
  $ 1msg channel use ODI371267300
  $ 1msg channel list
  $ 1msg channel current
  $ 1msg -c acme-prod channel info
  $ 1msg channel info --json
  $ 1msg channel status --json
  $ 1msg me --json
  $ 1msg channel settings set --ack-notifications --no-guaranteed-hooks

COLUMNS (channel list)
  default  name  instance_id  base_url

`channel info` calls GET /status then GET /me. `--json` prints one object:

  { "status": <GET /status body>, "me": <GET /me body> }

This is the only CLI-built JSON (not a single server body). If either call
fails, do not print a partial object: emit that call's error (raw body with
`--json`) and that HTTP status; skip the second call if the first failed.
`-c` / `--channel` take a config name, not an instance id.


FLAGS (settings set)
      --webhook-url <url>          Repeatable, max 5; empty string clears webhooks
      --guaranteed-hooks           Retry webhooks until acknowledged
      --no-guaranteed-hooks
      --ack-notifications          Include ACK / status events
      --no-ack-notifications
      --raw-hooks                  Forward raw provider payloads
      --no-raw-hooks
      --template-analytics         Enable template analytics
      --no-template-analytics
      --cta-tracking-opt-out       Opt out of CTA URL click tracking
      --no-cta-tracking-opt-out

FLAGS (automation set)
      --welcome                    Enable welcome message
      --no-welcome
      --prompt <text>              Repeatable, max 4, each ≤ 80 chars
      --command <name:description> Repeatable slash commands

FLAGS
  -c, --channel <name>   Selects which config channel (does not filter `list`)
  -h, --help
```

### `1msg channel use --help`

```
Set the default channel in the config file. Local only; no API call.

USAGE
  1msg channel use <name|instance-id>

LOOKUP
  1. Exact key under channels: in the config file (e.g. acme-prod)
  2. Else unique instance_id among channels
  3. Zero matches: exit 1, "channel \"…\" not in config"
  4. Two or more names share that instance_id: exit 1,
     "instance id … matches NAME and NAME; pass a config name"

`--channel` / ONE_MSG_CHANNEL / tab-completion still use config names.
`remove` takes a config name only.

EXAMPLES
  $ 1msg channel use acme-test
  $ 1msg channel use ODI371267300
```

### `1msg channel info --help`

```
Human summary of the selected channel: GET /status then GET /me.

USAGE
  1msg channel info [flags]

FLAGS
      --json               One object: { "status": <GET /status>, "me": <GET /me> }
  -c, --channel <name>
  -h, --help

EXAMPLES
  $ 1msg channel info
  $ 1msg channel info --json
  $ 1msg -c acme-prod channel info --json

Without --json: key-value from both responses (status, accountStatus,
mm_lite_available, then profile fields from /me).
With --json: the two raw bodies nested under "status" and "me". Not a server
schema — CLI-only. A single endpoint remains `1msg status --json` / `1msg me --json`.
```

```json
{
  "status": {
    "isCloud": true,
    "status": "connected",
    "accountStatus": "authenticated",
    "mm_lite_available": false
  },
  "me": {
    "about": "Available 9–18",
    "phone": "12020721369"
  }
}
```

### `1msg channel add --help`

```
Add a named channel to the config file. Does not change the default unless
this is the first channel (then it becomes default).

USAGE
  1msg channel add [flags]

FLAGS
      --name <name>            Required. Config name (e.g. acme-prod), not instance id
      --base-url <url>         https://api.1msg.io | https://sandbox.1msg.io
                               Also accepts https://api-stage.1msg.io and http://127.0.0.1:3050
      --instance-id <id>       Required unless ONE_MSG_INSTANCE_ID is set
      --token-stdin            Read token from stdin
      --default                Make this channel the default
      --no-verify              Skip GET /status after save
  -h, --help

EXAMPLES
  $ 1msg channel add --name acme-test --base-url https://sandbox.1msg.io \
      --instance-id ODI371267301 --token-stdin
  $ 1msg channel add --name prod --base-url https://api.1msg.io \
      --instance-id ODI371267300 --token-stdin --default

Non-interactive: --name, --base-url, --instance-id, and a token (stdin or env)
are required. Interactive prompts match `1msg init` when flags are omitted.
Writes ~/.config/1msg/config.yaml mode 0600.
```

### `1msg status --help`

Alias of `1msg channel status` → `GET /status`.

```
USAGE
  1msg status [flags]
  1msg channel status [flags]

Prints connection status (typically `connected` when the number can send),
accountStatus, and mm_lite_available.

EXAMPLES
  $ 1msg status
  $ 1msg status --json
  $ 1msg -c acme-test status

COLUMNS (human)
  key-value: status, accountStatus, mm_lite_available
```

### `1msg send --help` / `1msg message send --help`

```
Send a text or file message (session window must be open).
Outside 24h use: 1msg template send

USAGE
  1msg send [flags]
  1msg message send [flags]

Exactly one destination: --to or --chat-id.
Exactly one body: --text, --file, or --media-id.

FLAGS
      --to <phone>
      --chat-id <id>
      --text <body>              UTF-8 text (max 4096) → sendMessage
      --file <path|url>          Local file or https URL → sendFile
      --caption <text>           Caption when sending a file (max 1024)
      --filename <name>          File name with extension. Required with an
                                 https --file URL (API requires filename with
                                 body). Optional for a local path (default:
                                 basename). Ignored with --media-id.
      --media-id <id>            WABA media id from `1msg media upload`
      --media-type <type>        image | video | audio | document (required with --media-id)
      --voice                    Native voice note (audio/ogg only)
      --quote <wamid>
  -h, --help

EXAMPLES
  $ 1msg send --to 12020721369 --text "Hello"
  $ 1msg send --chat-id 12020721369@c.us --text "Hello" --quote wamid.HBgN…
  $ 1msg send --to 12020721369 --file ./photo.jpg --caption "Look"
  $ 1msg send --to 12020721369 --file https://example.com/a.pdf --filename invoice.pdf
  $ 1msg send --to 12020721369 --media-id 123456 --media-type image

A local --file is read from disk, encoded as a data URI, and sent as
sendFile.body. An https URL is passed through as sendFile.body and **requires
--filename**. This does not call uploadMedia unless you run `1msg media upload`
yourself. Exit 1 if --file is an https URL without --filename.

`1msg send` is only sendMessage + sendFile. The other 15 public send
operations are under `1msg message --help` and `1msg template send`.
```

### `1msg message --help`

```
Send, list, and mark messages.

USAGE
  1msg message <command> [flags]

COMMANDS
  send                 Text or file (see 1msg send)
  list                 Stored chat history (GET /messages)
  read                 Mark a message as read (POST /readMessage)
  react                Send or remove a reaction
  location             Send a location pin
  location-request     Ask the user to share location
  contact              Send a contact card
  buttons              Interactive reply buttons (max 3)
  menu                 Interactive list message (WhatsApp list)
  carousel             Carousel
  product              Product message
  cta                  CTA URL button
  address              Address message
  order                Order details
  payment              Payment request
  sticker              Sticker
  flow                 Send a Flow message

SEND FORMATS (all 17 public send* operations)
  send --text                POST /sendMessage
  send --file|--media-id     POST /sendFile (url, data URI, mediaId, --voice)
  template send              POST /sendTemplate (Cloud API components, MM Lite)
  react                      POST /sendReaction
  location                   POST /sendLocation
  location-request           POST /sendLocationRequest
  contact                    POST /sendContact
  buttons                    POST /sendButton
  menu                       POST /sendList
  carousel                   POST /sendCarousel
  product                    POST /sendProduct
  cta                        POST /sendCtaUrl
  address                    POST /sendAddressMessage
  order                      POST /sendOrderDetails
  payment                    POST /sendPaymentRequest
  sticker                    POST /sendSticker
  flow                       POST /sendFlow

`message list` is inbox history. WhatsApp interactive lists are `message menu`.
Carousel-as-template (no 24h window) is `1msg template send --params`, not
`message carousel`.

EXAMPLES
  $ 1msg message send --to 12020721369 --text "Hello"
  $ 1msg message list --chat-id 12020721369@c.us --limit 20
  $ 1msg message location --to 12020721369 --lat 55.7558 --lng 37.6173
  $ 1msg message buttons --to 12020721369 --text "Choose:" --button yes:Yes
  $ 1msg template send --to 12020721369 --name hello_world --lang en
```

#### `1msg message list --help`

```
USAGE
  1msg message list [flags]

FLAGS
      --chat-id <id>             Filter one chat
      --limit <n>                Max rows (API default 100)
      --last                     Latest first (DESC)
      --msg-id <id>              Filter by stored message id
      --min-time <unix>          Lower bound
      --max-time <unix>          Upper bound
      --first-number <n>
      --last-number <n>

COLUMNS
  time  chat_id  from  type  id  body

EXAMPLES
  $ 1msg message list
  $ 1msg message list --chat-id 12020721369@c.us --limit 20 --last
  $ 1msg message list --limit 5 --json
```

#### `1msg message read --help`

```
USAGE
  1msg message read --message-id <id> [flags]

FLAGS
      --message-id <id>          Required. API field messageId / msgId
      --typing                   Show typing indicator (max 25s)

The read API does not take a chat id.

EXAMPLES
  $ 1msg message read --message-id wamid.HBgNMTIwMjA3MjEzNjkVAgARGBI5RTBCNUY0QUE2RjZBQzhGNDkA
  $ 1msg message read --message-id wamid.… --typing
```

#### `1msg message react --help`

Public `POST /sendReaction` fields are `body` (emoji) and `quotedMsgId` (target).
CLI names stay verb+noun:

```
USAGE
  1msg message react --message-id <id> --emoji <emoji> [flags]

FLAGS
      --to / --chat-id           Required destination
      --message-id <id>          Target message → API quotedMsgId
      --emoji <emoji>            Reaction → API body. Empty string removes it

EXAMPLES
  $ 1msg message react --to 12020721369 --message-id wamid.… --emoji "👍"
  $ 1msg message react --chat-id 12020721369@c.us --message-id wamid.… --emoji ""
```

#### `1msg message location --help`

```
USAGE
  1msg message location --lat <n> --lng <n> [flags]

FLAGS
      --to / --chat-id / --quote
      --lat <n>                  Required, -90..90
      --lng <n>                  Required, -180..180
      --name <text>
      --address <text>

EXAMPLES
  $ 1msg message location --to 12020721369 --lat 55.7558 --lng 37.6173 \
      --name "Red Square" --address "Moscow"
```

#### `1msg message location-request --help`

```
USAGE
  1msg message location-request [flags]

FLAGS
      --to / --chat-id / --quote
      --text <body>              Optional prompt

EXAMPLES
  $ 1msg message location-request --to 12020721369 --text "Share your location"
```

#### `1msg message contact --help`

```
USAGE
  1msg message contact --name <formatted> --phone <number> [flags]

FLAGS
      --to / --chat-id / --quote
      --name <formatted>         Required (formatted_name)
      --first-name <text>
      --last-name <text>
      --phone <number>           Contact's phone (not the destination)
      --email <email>
      --org <company>
      --title <text>
      --url <url>
      --from-file <path>         Full contact JSON (SendContactRequest)

EXAMPLES
  $ 1msg message contact --to 12020721369 --name "John Doe" --phone +12020721369
  $ 1msg message contact --to 12020721369 --from-file contact.json
```

#### `1msg message buttons --help`

```
USAGE
  1msg message buttons --text <body> --button <id:title> [flags]

FLAGS
      --to / --chat-id / --quote
      --text <body>              Required, max 1024
      --footer <text>            Max 60
      --button <id:title>        Repeatable, max 3
      --from-file <path>         Full SendButtonRequest JSON. Optional
                                 interactive header (text/image/video/document)
                                 is only via --from-file, not a flag.

EXAMPLES
  $ 1msg message buttons --to 12020721369 --text "Choose:" \
      --button yes:Yes --button no:No
  $ 1msg message buttons --to 12020721369 --from-file buttons.json
```

#### `1msg message menu --help`

```
USAGE
  1msg message menu --from-file <path> [flags]

API requires body, buttonText, and sections[]. sections[] is nested JSON,
so --from-file is required. --text / --button-text / --title / --footer
override the file when set. Destination may be on the CLI or in the file.

FLAGS
      --to / --chat-id / --quote
      --from-file <path>         Required. `-` = stdin. Public sendList body
      --text <body>              Override body (max 1024)
      --button-text <text>       Override list button label (max 20)
      --title <text>             Max 60
      --footer <text>            Max 60

EXAMPLES
  $ 1msg message menu --to 12020721369 --from-file menu.json
  $ 1msg message menu --from-file menu.json --text "Pick one" --button-text "Open"
```

#### `1msg message carousel --help`

Public `POST /sendCarousel` prefers `cards` (2–10). `params` with a CAROUSEL
component is the template-like alternative. Shared `SendCarouselRequest.yaml`
(catalogId/sections) is not the public bundled schema — do not use it.

```
USAGE
  1msg message carousel --from-file <path> [flags]

FLAGS
      --to / --chat-id / --quote
      --text <body>              Text above the carousel
      --from-file <path>         Required. JSON with cards[] and/or params[]

EXAMPLES
  $ 1msg message carousel --to 12020721369 --from-file carousel.json
  $ 1msg message carousel --to 12020721369 --text "Pick a product" --from-file cards.json
```

#### `1msg message product --help`

```
USAGE
  1msg message product [flags]

Exactly one of: --from-file, or --catalog-id plus --product-id (single product).
Product lists use --from-file (action.sections).

FLAGS
      --to / --chat-id / --quote
      --text <body>
      --header <text>            Product list only
      --footer <text>
      --catalog-id <id>
      --product-id <retailer-id> Single product (action.product_retailer_id)
      --from-file <path>         Full body including action

EXAMPLES
  $ 1msg message product --to 12020721369 --catalog-id 448008021021719 --product-id 0001
  $ 1msg message product --to 12020721369 --from-file product-list.json
```

#### `1msg message cta --help`

```
USAGE
  1msg message cta --text <body> --button <label> --url <https> [flags]

FLAGS
      --to / --chat-id / --quote
      --text <body>              Required → body
      --button <label>           Required → displayText
      --url <https>              Required
      --footer <text>
      --from-file <path>         Optional header object and extras

EXAMPLES
  $ 1msg message cta --to 12020721369 --text "See details" \
      --button "Open site" --url https://example.com
```

#### `1msg message address --help`

India and Singapore only. Recipient phone country must match `--country`.

```
USAGE
  1msg message address --text <body> --country <IN|SG> [flags]

FLAGS
      --to / --chat-id / --quote
      --text <body>              Required
      --country <IN|SG>          Default IN
      --from-file <path>         Optional values / saved_addresses /
                                 validation_errors

EXAMPLES
  $ 1msg message address --to 919876543210 --text "Delivery address?" --country IN
  $ 1msg message address --to 6531650115 --text "Delivery address?" --country SG
```

#### `1msg message order --help`

India payments. Utility template with an ORDER_DETAILS button.
Works outside the 24h window (template path).

```
USAGE
  1msg message order --from-file <path> [flags]

API requires template, namespace, language, and order (order.items required).

FLAGS
      --to / --chat-id
      --name <template>          Utility template name
      --lang <code>
      --namespace <id>
      --reference-id <id>
      --currency <code>          e.g. INR
      --from-file <path>         Required for order / paymentSettings / extra params

EXAMPLES
  $ 1msg message order --to 919876543210 --name order_details_utility \
      --lang en --namespace YOUR_NS --from-file order.json
```

#### `1msg message payment --help`

Regional payment request (beta). Public schema requires `phone` and `region`
(IN | SG | BR). There is no chatId field — use `--to` only.

```
USAGE
  1msg message payment --to <phone> --region <IN|SG|BR> [flags]

FLAGS
      --to <phone>               Required (API phone, not chatId)
      --region <IN|SG|BR>        Required
      --text <body>
      --from-file <path>         interactive / action objects

EXAMPLES
  $ 1msg message payment --to 919876543210 --region IN --text "Pay now" \
      --from-file payment.json
```

#### `1msg message sticker --help`

```
USAGE
  1msg message sticker [flags]

Exactly one source: --link, --media-id, or --file.

FLAGS
      --to / --chat-id / --quote
      --link <https>             Public webp URL
      --media-id <id>            From `1msg media upload`
      --file <path>              Local webp: uploadMedia, then send with mediaId

EXAMPLES
  $ 1msg message sticker --to 12020721369 --link https://example.com/sticker.webp
  $ 1msg message sticker --to 12020721369 --file ./sticker.webp
  $ 1msg message sticker --to 12020721369 --media-id 123456
```

#### `1msg message flow --help`

Session window must be open. Outside 24h send a template with a FLOW button
via `1msg template send`.

```
USAGE
  1msg message flow --text <body> --flow-id <id> --flow-token <token> --cta <text> [flags]

FLAGS
      --to / --chat-id / --quote
      --text <body>              Required
      --flow-id <id>             Required (published Flow id)
      --flow-token <token>       Required (business-generated)
      --cta <text>               Required (flowCta)
      --header <text>
      --footer <text>
      --action <navigate|data_exchange>
      --screen <id>              flowActionPayload.screen (navigate)
      --mode <draft|published>
      --from-file <path>         flowActionPayload / extra fields

EXAMPLES
  $ 1msg message flow --to 12020721369 --text "Open form" --flow-id FLOW123 \
      --flow-token tok --cta "Start" --action navigate --screen WELCOME
```

`--from-file` may be `-` (stdin). File JSON is the public request body.

### `1msg template --help`

```
Message templates (work outside the 24-hour session window).

USAGE
  1msg template <command> [flags]

COMMANDS
  list                 GET /templates
  send                 POST /sendTemplate
  add                  POST /addTemplate
  remove               POST /removeTemplate
```

```
1msg template list [flags]
FLAGS
      --limit <n>
      --offset <n>
      --sort <id|name|status>

COLUMNS
  name  status  language  category  id
  footer: total N

EXAMPLES
  $ 1msg template list
  $ 1msg template list --sort name --json
```

```
1msg template send [flags]
FLAGS
      --to / --chat-id / --quote
      --name <template>          Template name (not HSM element_name)
      --lang <code>              e.g. en, ru  (policy=deterministic)
      --namespace <id>
      --params <json>            Cloud API components array (not a string list)
      --params-file <path>       Same JSON from file
      --mm-lite                  Force Marketing Messages API
      --activity-sharing         Click-tracking webhooks (MM Lite path)
      --ttl <seconds>            message_send_ttl_seconds

EXAMPLES
  $ 1msg template send --to 12020721369 --name hello_world --lang en \
      --params '[{"type":"body","parameters":[{"type":"text","text":"Ivan"}]}]'
```

```
1msg template add --from-file <path> [flags]

--from-file is required. The JSON must include components[] (HEADER / BODY /
FOOTER / BUTTONS). Optional flags override scalar fields in the file.

FLAGS
      --from-file <path>         Required. `-` = stdin
      --name <name>              Override file name
      --category <MARKETING|UTILITY|AUTHENTICATION>
      --language <code>          Override file language (e.g. en_US)

EXAMPLES
  $ 1msg template add --from-file hello_world.json
  $ 1msg template add --from-file hello_world.json --name hello_world_v2

Exit 1 if --from-file is missing or components[] is absent.

1msg template remove --name hello_world

EXAMPLES
  $ 1msg template remove --name hello_world
```

### `1msg me --help`

```
WhatsApp Business profile (GET /me, POST /me).

USAGE
  1msg me [flags]
  1msg me update [flags]

FLAGS (update; at least one required)
      --about <text>
      --address <text>
      --description <text>
      --email <email>
      --vertical <text>          ProfileInfo industry enum (e.g. "Food and Grocery")
      --photo <url|data-uri>
      --website <url>            Repeatable → websites[]

EXAMPLES
  $ 1msg me
  $ 1msg me --json
  $ 1msg me update --about "Available 9–18" --email support@example.com
```

### `1msg media --help`

```
WABA media storage.

USAGE
  1msg media <command> [flags]

COMMANDS
  upload               POST /uploadMedia — prints mediaId
  get                  GET /retrieveMedia — metadata + temporary url (~5 min)
  delete               DELETE /media/{mediaId}

EXAMPLES
  $ 1msg media upload --file ./photo.jpg
  $ 1msg media upload --url https://example.com/a.pdf
  $ 1msg media get --id 123456
  $ 1msg media delete --id 123456

FLAGS (upload)
      --file <path>              Local file → data URI in body (public uploadMedia)
      --url <https>              Public URL (API field url / body)

Public uploadMedia accepts URL or data URI, not multipart. Unused
shared UploadMediaRequest.yaml (file + MIME enum) is not this endpoint.

POST /deleteMedia (deleteMediaLegacy) is not exposed.

EXAMPLES
  $ 1msg media upload --file ./photo.jpg
  $ 1msg media upload --url https://example.com/a.pdf
  $ 1msg media get --id 123456
  $ 1msg media delete --id 123456
```

### `1msg group --help`

```
USAGE
  1msg group <command> [flags]

COMMANDS
  list                 GET /groups
  create               POST /groups
  get <group-id>       GET /groups/{groupId}
  update <group-id>    POST /groups/{groupId}
  delete <group-id>    DELETE /groups/{groupId}
  invite-link <id>     GET /groups/{groupId}/inviteLink
  invite-link reset <id>  POST /groups/{groupId}/inviteLink

group-id is the WABA group id without @g.us.

FLAGS (list)
      --limit <n>  --before <cursor>  --after <cursor>

FLAGS (create)
      --name <subject>           Required (groupName)
      --description <text>

FLAGS (get)
      --fields <csv>

FLAGS (update)
      --subject <text>
      --description <text>
      --picture <url|data-uri>

COLUMNS (list)
  id  subject

EXAMPLES
  $ 1msg group list
  $ 1msg group create --name "Support team" --description "Customer support"
  $ 1msg group get 120363046942338209
  $ 1msg group update 120363046942338209 --subject "Support"
  $ 1msg group invite-link 120363046942338209
  $ 1msg group invite-link reset 120363046942338209
  $ 1msg group delete 120363046942338209
```

### `1msg flow --help`

```
WhatsApp Flows. Some endpoints currently return HTTP 501 until the Meta
Graph Flows rewrite is available — the CLI still exposes them and prints
the API error.

USAGE
  1msg flow <command> [flags]

COMMANDS
  list                 GET /flows
  create               POST /flows
  get <flow-id>        GET /flows/{flowId}
  delete <flow-id>     DELETE /flows/{flowId}
  preview <flow-id>    GET /flows/{flowId}/preview
  publish <flow-id>    POST /flows/{flowId}/publish
  deprecate <flow-id>  POST /flows/{flowId}/deprecate
  metadata <flow-id>   PATCH /flows/{flowId}/metadata
  assets <flow-id>     PATCH /flows/{flowId}/assets  (replace flowJson)
  encryption           GET /whatsapp_business_encryption
  encryption set       POST /whatsapp_business_encryption

FLAGS (all flow API commands)
      --waba-account-id <id>     Query wabaAccountId

FLAGS (list)
      --fields <csv>

FLAGS (create)
      --name <name>              Required
      --category <ENUM>          Repeatable: SIGN_UP, SIGN_IN,
                                 APPOINTMENT_BOOKING, LEAD_GENERATION,
                                 CONTACT_US, CUSTOMER_SUPPORT, SURVEY, OTHER
      --endpoint <uri>
      --publish                  Publish immediately
      --json-file <path>         flowJson document

FLAGS (metadata)
      --name --category --endpoint

FLAGS (assets)
      --json-file <path>         Required flowJson

FLAGS (encryption set)
      --pem-file <path>          2048-bit RSA public key PEM

COLUMNS (list)
  id  name  status  categories

EXAMPLES
  $ 1msg flow list
  $ 1msg flow create --name lead_form --category LEAD_GENERATION
  $ 1msg flow get FLOW123
  $ 1msg flow publish FLOW123
  $ 1msg flow assets FLOW123 --json-file flow.json
  $ 1msg flow encryption
  $ 1msg flow encryption set --pem-file business.pem
```

### `1msg webhook --help`

```
USAGE
  1msg webhook get
  1msg webhook set --url <https> [--url <https> ...]
  1msg webhook clear

set replaces the stored list (max 5). It does not append.
clear calls POST /settings with an empty webhookUrl (setWebhook rejects empty).

EXAMPLES
  $ 1msg webhook get
  $ 1msg webhook set --url https://example.com/webhook
  $ 1msg webhook set --url https://a.example/hook --url https://b.example/hook
  $ 1msg webhook clear
```

### `1msg user --help`

```
USAGE
  1msg user blocked            GET /blockedUsers
  1msg user block --to <phone>     POST /blockUser
  1msg user unblock --to <phone>   POST /unblockUser

COLUMNS (blocked)
  phone

EXAMPLES
  $ 1msg user blocked
  $ 1msg user block --to 12020721369
  $ 1msg user unblock --to 12020721369
```

### `1msg catalog --help`

```
USAGE
  1msg catalog get
  1msg catalog set --cart --visible
  1msg catalog set --no-cart --no-visible

get  → GET /commerce
set  → POST /commerce with params.is_cart_enabled and params.is_catalog_visible
       (both required by the API)

Fails when the WABA has no catalog linked — that is an account limit, not a CLI bug.

COLUMNS (get)
  id  cart  visible

EXAMPLES
  $ 1msg catalog get
  $ 1msg catalog set --cart --visible
  $ 1msg catalog set --no-cart --no-visible
```

### `1msg call --help`

```
WhatsApp Calling API (beta). 1msg proxies signaling only. Real media needs
your own WebRTC or SIP stack. Trial / subscriptionBlocked → HTTP 403.

USAGE
  1msg call settings              GET /callingSettings
  1msg call settings set --from-file <path>
  1msg call connect --to <phone> --sdp-file <offer.sdp> [--callback-data <str>]
  1msg call pre-accept --call-id <id> --sdp-file <answer.sdp>
  1msg call accept --call-id <id> --sdp-file <answer.sdp>
  1msg call reject --call-id <id>
  1msg call hangup --call-id <id>

All call-control commands POST /initiateCall. The CLI always sets
messaging_product=whatsapp (required by the API; not a user flag).

  connect     action=connect     requires --to + --sdp-file (sdp_type=offer)
  pre-accept  action=pre_accept  requires --call-id + --sdp-file (sdp_type=answer)
  accept      action=accept      requires --call-id + --sdp-file (sdp_type=answer)
  reject      action=reject      requires --call-id
  hangup      action=terminate   requires --call-id

Do not echo Meta's offer SDP as the answer.
settings set body is forwarded as-is (CallingSettings). Prefer focused
updates (enable status first, then SIP).

EXAMPLES
  $ 1msg call settings
  $ 1msg call settings set --from-file calling.json
  $ 1msg call connect --to 12185552828 --sdp-file offer.sdp
  $ 1msg call accept --call-id wacid.ABGG… --sdp-file answer.sdp
  $ 1msg call hangup --call-id wacid.ABGG…
```

### `1msg completion --help`

```
Print a completion script to stdout. The CLI never writes into /etc or $fpath
by itself — redirect the script, then reload the shell.

USAGE
  1msg completion <bash|zsh|powershell>

WHAT IS COMPLETED
  commands, subcommands, flags     always (from the command tree)
  channel names (-c / --channel / channel use / remove)
                                   keys of channels: in ~/.config/1msg/config.yaml
                                   (local file, no API call)
  template names (template send --name, template remove --name)
                                   from the completion cache written after a
                                   successful `1msg template list` (see below)
  flow ids / group ids             not cached; type them

TEMPLATE CACHE
  File:  ~/.cache/1msg/completion.json
         Windows: %LOCALAPPDATA%\1msg\completion.json
  Shape: { "updated_at": "<iso>", "channel": "<config name>", "templates": ["hello_world", …] }
  Written only after `template list` exits 0. Names are unique `templates[].name`.
  Completing --name with no cache: no values (commands/flags still complete).
  Cache is per default channel name; switching `channel use` without a new
  `template list` may show stale names — run `1msg template list` again.

INSTALL — Bash
  User (no sudo):
    mkdir -p ~/.local/share/bash-completion/completions
    1msg completion bash > ~/.local/share/bash-completion/completions/1msg
  Linux system:
    1msg completion bash | sudo tee /etc/bash_completion.d/1msg
  macOS Homebrew:
    1msg completion bash > "$(brew --prefix)/etc/bash_completion.d/1msg"
  Then:  source ~/.bashrc   # or open a new terminal

INSTALL — Zsh
  mkdir -p ~/.zsh/completions
  1msg completion zsh > ~/.zsh/completions/_1msg
  # once in ~/.zshrc:
  #   fpath=($HOME/.zsh/completions $fpath)
  #   autoload -U compinit && compinit
  Then:  exec zsh
  Do not write to ${fpath[1]} — that path is not stable.

INSTALL — PowerShell
  $dir = Split-Path $PROFILE
  New-Item -ItemType Directory -Force $dir | Out-Null
  1msg completion powershell | Out-File -Encoding utf8 (Join-Path $dir 1msg.ps1)
  # once in $PROFILE:
  #   . (Join-Path (Split-Path $PROFILE) '1msg.ps1')
  Then:  . $PROFILE

EXAMPLES
  $ 1msg completion bash > ~/.local/share/bash-completion/completions/1msg
  $ 1msg completion zsh > ~/.zsh/completions/_1msg
  $ 1msg completion powershell | Out-File 1msg.ps1
```

### `1msg version --help`

```
USAGE
  1msg version
  1msg -v

Prints CLI version and the `@1msg/sdk` version used for HTTP.

EXAMPLES
  $ 1msg version
  $ 1msg -v
```

### Errors

Public API errors are `{ "error": "<string>" }` plus HTTP status
(`shared/schemas/ErrorResponse.yaml`). There is no `code` field. The CLI
does not invent one (`TOKEN_EXPIRED` and similar belong on an API ticket,
not here). Ticket “код ошибки API” is the **HTTP status**.

Human output: message + `(HTTP <status>)` + hint. `--json` on an API error
prints the raw server body (no CLI envelope). Usage errors (no HTTP) print
`{ "error": "<string>" }` and exit 1.

```
$ 1msg send --to 12020721369 --text "Hello"
Error: invalid or expired token (HTTP 401)
Hint: set ONE_MSG_TOKEN or run `1msg init`

$ 1msg send --text "Hello"
Error: missing destination: pass --to or --chat-id
See: 1msg send --help

$ 1msg send --to 12020721369 --text "Hello" --file ./a.jpg
Error: pass exactly one of --text, --file, or --media-id

$ 1msg -c missing status
Error: channel "missing" not in config
See: 1msg channel list

$ 1msg channel use ODI371267300
# ok when exactly one config name has that instance_id

$ 1msg channel use ODI371267300
Error: instance id ODI371267300 matches acme-prod and acme-test; pass a config name
```

Usage errors with `--json` (no HTTP) print:

```json
{ "error": "missing destination: pass --to or --chat-id" }
```

Exit codes: `0` ok · `1` usage · `2` API 4xx · `3` API 5xx · `4` network · `5` not configured.

---

## Config and multi-channel

```yaml
# ~/.config/1msg/config.yaml  mode 0600
version: 1
default_channel: acme-prod
channels:
  acme-prod:
    base_url: https://api.1msg.io
    instance_id: ODI371267300
    # token omitted → filled from ONE_MSG_TOKEN
  acme-test:
    base_url: https://sandbox.1msg.io
    instance_id: ODI371267301
    token: "…"   # optional; file mode 0600
```

### Precedence

Resolve **which channel** first, then **fill holes**, then **flags**.

1. Channel name: `--channel` / `ONE_MSG_CHANNEL` / `default_channel` / the only channel in the file.
2. Take `base_url`, `instance_id`, `token` from that block.
3. If a field is empty, fill from `ONE_MSG_BASE_URL` / `ONE_MSG_INSTANCE_ID` / `ONE_MSG_TOKEN`.
4. `--base-url` / `--instance-id` / `--token` always win.
5. If there is no config file, the three env vars are the implicit channel (CI).
6. Else exit `5`: `no channel configured — run 1msg init`.

A named channel that already has a token is **not** overridden by a leftover `ONE_MSG_TOKEN` in the shell (MCP/dev). `-c` on `channel list` is ignored: `list` is always the full local file.

Never print tokens in tables, logs, or `--json`.

### Typical flows

```bash
1msg init
1msg status
1msg send --to 12020721369 --text "ping"

1msg channel add --name prod --base-url https://api.1msg.io --instance-id ODI… --token-stdin
1msg channel add --name test --base-url https://sandbox.1msg.io --instance-id ODI… --token-stdin
1msg channel use test
1msg channel use ODI371267300
1msg -c test send --to 12020721369 --text "sandbox ping"
1msg -c prod template list --json

export ONE_MSG_BASE_URL=https://api.1msg.io
export ONE_MSG_INSTANCE_ID=ODI371267300
export ONE_MSG_TOKEN=***
1msg send --to 12020721369 --text "from ci" --json
```

---

## Output

Default: columns / key-value, stable names.

`--json`: exact API response body. `send` human output:

```
sent  true
id    gBGGeRhGZTEfAgkJCh2wAz4ZH-8
to    12020721369@c.us
```

---

## Stack

**TypeScript, Node ≥ 18, `commander`, `@1msg/sdk`.** Package `@1msg/cli`, bin `1msg`.

HTTP only through `createClient({ baseUrl, instanceId, token })`. No `fetch` / `axios` / `node-fetch`. Same architecture test as MCP.

Commands are hand-mapped (verb + noun), not generated 1:1 from OpenAPI. CI check: every public `operationId` is either in the map below or explicitly `deleteMediaLegacy`.

Distribution: implementation home `1msg-api/packages/cli`; public repo [`1msg/1msg-cli`](https://github.com/1msg/1msg-cli) (`npx @1msg/cli`). Optional later: `bun build --compile`. Go is not v1 — the TypeScript SDK already has the client facade MCP uses.

---

## Full map (public `operationId` → command)

| operationId | CLI |
|---|---|
| `sendMessage` | `message send --text` / `send --text` |
| `sendFile` | `message send --file` / `--media-id` |
| `createUploadMedia` | `media upload` |
| `listMessages` | `message list` |
| `createReadMessage` | `message read` |
| `sendTemplate` | `template send` |
| `listTemplates` | `template list` |
| `addTemplate` | `template add` |
| `removeTemplate` | `template remove` |
| `getStatus` | `status` / `channel status` |
| `getMe` | `me` |
| `updateMe` | `me update` |
| `retrieveMedia` | `media get` |
| `deleteMedia` | `media delete` |
| `sendReaction` | `message react` |
| `sendLocation` | `message location` |
| `sendLocationRequest` | `message location-request` |
| `sendContact` | `message contact` |
| `sendButton` | `message buttons` |
| `sendList` | `message menu` |
| `sendCarousel` | `message carousel` |
| `sendProduct` | `message product` |
| `sendCtaUrl` | `message cta` |
| `sendAddressMessage` | `message address` |
| `sendOrderDetails` | `message order` |
| `sendPaymentRequest` | `message payment` |
| `sendSticker` | `message sticker` |
| `sendFlow` | `message flow` |
| `getWebhook` | `webhook get` |
| `setWebhook` | `webhook set` |
| `listSettings` | `channel settings` |
| `createSettings` | `channel settings set` / `webhook clear` |
| `getMmLiteStatus` | `channel mm-lite` |
| `getCommerce` | `catalog get` |
| `createCommerce` | `catalog set` |
| `getConversationalAutomation` | `channel automation` |
| `setConversationalAutomation` | `channel automation set` |
| `blockUser` | `user block` |
| `unblockUser` | `user unblock` |
| `listBlockedUsers` | `user blocked` |
| `createGroups` | `group create` |
| `listGroups` | `group list` |
| `getGroupsGroupId` | `group get` |
| `createGroupsGroupId` | `group update` |
| `deleteGroupsGroupId` | `group delete` |
| `getGroupsGroupIdInvitelink` | `group invite-link` |
| `createGroupsGroupIdInvitelink` | `group invite-link reset` |
| `createFlows` | `flow create` |
| `listFlows` | `flow list` |
| `getFlowsFlowId` | `flow get` |
| `deleteFlowsFlowId` | `flow delete` |
| `patchFlowsFlowIdMetadata` | `flow metadata` |
| `patchFlowsFlowIdAssets` | `flow assets` |
| `getFlowsFlowIdPreview` | `flow preview` |
| `createFlowsFlowIdPublish` | `flow publish` |
| `createFlowsFlowIdDeprecate` | `flow deprecate` |
| `getCallingSettings` | `call settings` |
| `updateCallingSettings` | `call settings set` |
| `initiateCall` | `call connect` / `pre-accept` / `accept` / `reject` / `hangup` |
| `getWhatsappBusinessEncryption` | `flow encryption` |
| `setWhatsappBusinessEncryption` | `flow encryption set` |
| `deleteMediaLegacy` | not exposed (`media delete` uses `DELETE /media/{id}`) |

Local-only (no `operationId`): `init`, `channel list|use|add|remove|current`, `completion`, `version`.

---

## Implementation notes

1. Freeze every `--help` block above as snapshot tests.
2. `packages/cli`, `bin: { "1msg": "dist/index.js" }`, workspace like `@1msg/mcp`.
3. Hand-written commands + SDK client; copy MCP `sdk-only-architecture.test.ts`.
4. Do not add `generate:cli-tools` that emits one command per `operationId`.
5. Coverage CI: the map table is generated from this file or a `commands.ts` source of truth and diffed against public OpenAPI `operationId`s.

## Next ticket (not this RFC)

1MSG-164 is design only. Implementation: [1MSG-166](https://plane.1msg.io/1msg/browse/1MSG-166/).

- `1msg-api/packages/cli` workspace, `bin: { "1msg": "dist/index.js" }`, npm `@1msg/cli`
- Snapshot tests of every `--help` block in this document
- SDK-only architecture test (copy MCP `sdk-only-architecture.test.ts`)
- CI: 61 mapped public `operationId`s + explicit `deleteMediaLegacy` skip = 62
- Public repo [`1msg/1msg-cli`](https://github.com/1msg/1msg-cli) (`npx @1msg/cli`), same distribution pattern as MCP

Do not start that work under this ticket.

## Audit (re-check against `public/openapi.bundled.yaml`)

62 `operationId`s in the bundled public spec. Counted from the spec, not from MCP.

| Check | Result |
|---|---|
| Spec operationIds | 62 |
| Mapped to a CLI command | 61 |
| Intentionally hidden | 1 — `deleteMediaLegacy` (deprecated POST alias of `DELETE /media/{id}`) |
| Unmapped leftover | 0 |
| Root `--help` commands that are stubs | 0 |
| Ticket examples | `message send`, `channel info`, `channel info --json`, `template list` — present |
| `--json` | Raw API body. Exception: `channel info --json` is `{ "status": <GET /status>, "me": <GET /me> }` |
| `channel use` | Config name first, else unique `instance_id`. `-c` stays a config name |
| API error `code` | None. Human prints HTTP status; `--json` is the raw `{ "error" }` body |
| `sendReaction` CLI | `--emoji` → `body`, `--message-id` → `quotedMsgId` (bundled path schema, not unused `SendReactionRequest.yaml`) |
| `sendCarousel` CLI | Public `cards` / `params`, not unused `SendCarouselRequest.yaml` |
| `sendPaymentRequest` | `--to` + `--region` required; no `chatId` in public schema |
| `createReadMessage` | `--message-id` only; no chat id |
| Local `--file` on `send` | data URI → `sendFile.body`; does not call `uploadMedia` |
| Config vs env | Named channel values are not overridden by leftover `ONE_MSG_TOKEN` |
| Public `send*` operations | 17/17 mapped. Root `1msg send` is text/file only; the rest are in `message --help` + `template send` |
| `sendButton` header | text/image/video/document header only via `--from-file` |
| Carousel outside 24h | `template send --params` with a CAROUSEL component, not `message carousel` |

Ticket: [1MSG-164](https://plane.1msg.io/1msg/browse/1MSG-164/). Related: [1MSG-63](https://plane.1msg.io/1msg/browse/1MSG-63/) SDK, [1MSG-75](https://plane.1msg.io/1msg/browse/1MSG-75/) MCP.
