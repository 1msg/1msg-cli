# @1msg/cli

Command-line client for the [1MSG](https://1msg.io) WhatsApp Business API.

The product is the **full public API**, not an MVP: **61 of 62** public operations are commands. Legacy `deleteMediaLegacy` is not exposed (`1msg media delete` uses `DELETE /media/{id}`). Nothing prints `not implemented yet`.

HTTP never goes through `fetch` / `axios`. Every API call uses [`@1msg/sdk`](https://www.npmjs.com/package/@1msg/sdk). Commands are hand-mapped (verb + noun), not generated 1:1 from OpenAPI.

[![npm](https://img.shields.io/npm/v/@1msg/cli.svg)](https://www.npmjs.com/package/@1msg/cli)
[![node](https://img.shields.io/node/v/@1msg/cli.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@1msg/cli.svg)](./LICENSE)

| | |
|--|--|
| **npm** | [`@1msg/cli`](https://www.npmjs.com/package/@1msg/cli) |
| **Binary** | `1msg` (`npx @1msg/cli` is the same program) |
| **SDK** | [`@1msg/sdk`](https://www.npmjs.com/package/@1msg/sdk) |
| **Requires** | Node.js ≥ 18 |
| **Language** | English (`--help`, tables, errors) |
| **Docs** | [https://docs.1msg.io/](https://docs.1msg.io/) |

API hosts:

| Environment | `ONE_MSG_BASE_URL` |
|-------------|--------------------|
| Live channels | `https://api.1msg.io` |
| Test channels | `https://sandbox.1msg.io` |

Bare hostnames (`api.1msg.io`, `sandbox.1msg.io`) are accepted and normalized to `https://`. Stage / local (`api-stage.1msg.io`, `http://127.0.0.1:3050`) work for `init` / `channel add`.

> Implementation source of truth still lives in the `1msg-api` monorepo (`packages/cli`). This repository is the **distribution** package for `npx` / clone / npm. Flag text is frozen from the design RFC (`1msg-api/docs/CLI.md`).

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Global flags](#global-flags)
- [Commands](#commands)
- [Output](#output)
- [Errors and exit codes](#errors-and-exit-codes)
- [Shell completion](#shell-completion)
- [API coverage](#api-coverage)
- [Architecture](#architecture)
- [Development](#development)
- [Related](#related)

---

## Install

```bash
npx -y @1msg/cli --help
npx -y @1msg/cli version
```

Or install globally:

```bash
npm i -g @1msg/cli
1msg --help
```

### Clone and run

```bash
git clone https://github.com/1msg/1msg-cli.git
cd 1msg-cli
npm install
npm run build
node dist/index.js --help
```

---

## Quick start

```bash
npx -y @1msg/cli init
npx -y @1msg/cli status
npx -y @1msg/cli send --to 12020721369 --text "Hello"
npx -y @1msg/cli template list
```

Non-interactive init (CI / scripts):

```bash
printf '%s' "$ONE_MSG_TOKEN" | 1msg init --name prod \
  --base-url https://api.1msg.io --instance-id ODI371267300 --token-stdin
```

A channel is one WhatsApp instance (instance id + token). Commands use the default channel from the config file unless `--channel` is set.

Session messages (`1msg send`, most `1msg message *`) need an open 24-hour window. Outside that window use `1msg template send`.

---

## Configuration

Config file mode `0600`:

| OS | Path |
|----|------|
| Linux / macOS | `~/.config/1msg/config.yaml` (`$XDG_CONFIG_HOME/1msg/config.yaml`) |
| Windows | `%AppData%\1msg\config.yaml` |

```yaml
# ~/.config/1msg/config.yaml
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

There is **no API** to list a customer's channels. `channel list` / `use` / `add` / `remove` / `current` are always local.

Tokens are never printed in tables, logs, or `--json`.

### Environment

| Variable | Description |
|----------|-------------|
| `ONE_MSG_CHANNEL` | Same as `--channel` (config **name**, not instance id) |
| `ONE_MSG_BASE_URL` | `https://api.1msg.io` or `https://sandbox.1msg.io` |
| `ONE_MSG_INSTANCE_ID` | Channel instance id |
| `ONE_MSG_TOKEN` | Channel API token |

Deprecated aliases match MCP: `CHAT_API_BASE_URL`, `CHAT_API_TOKEN`, `CHAT_API_INSTANCE_ID`, `CHAT_API_KEY`, `TOKEN`, `INSTANCE_ID`. Prefer `ONE_MSG_*`.

`NO_COLOR` disables ANSI color (same as `--no-color`).

### Precedence

Resolve **which channel** first, then **fill empty fields**, then **flags**.

1. Channel name: `--channel` / `ONE_MSG_CHANNEL` / `default_channel` / the only channel in the file.
2. Take `base_url`, `instance_id`, `token` from that block.
3. If a field is empty, fill from `ONE_MSG_BASE_URL` / `ONE_MSG_INSTANCE_ID` / `ONE_MSG_TOKEN`.
4. `--base-url` / `--instance-id` / `--token` always win.
5. If there is no config file, the three env vars are the implicit channel (CI).
6. Else exit `5`: `no channel configured — run 1msg init`.

A named channel that already has a token is **not** overwritten by a leftover `ONE_MSG_TOKEN` in the shell. `-c` on `channel list` is ignored: `list` is always the full local file. `-c` / `--channel` take a config **name**, not an instance id.

### CI without a config file

```bash
export ONE_MSG_BASE_URL=https://api.1msg.io
export ONE_MSG_INSTANCE_ID=ODI371267300
export ONE_MSG_TOKEN=***
1msg send --to 12020721369 --text "from ci" --json
```

### Typical multi-channel flow

```bash
1msg channel add --name prod --base-url https://api.1msg.io \
  --instance-id ODI371267300 --token-stdin --default
1msg channel add --name test --base-url https://sandbox.1msg.io \
  --instance-id ODI371267301 --token-stdin
1msg channel use test
1msg channel use ODI371267300          # unique instance id → config name
1msg -c test send --to 12020721369 --text "sandbox ping"
1msg -c prod template list --json
```

`channel use` lookup: exact config key, else unique `instance_id`. Zero matches → exit 1. Two names sharing that instance id → pass a config name.

---

## Global flags

Available on every command:

| Flag | Description |
|------|-------------|
| `-c, --channel <name>` | Named channel from the config file |
| `--instance-id <id>` | Override instance id |
| `--base-url <url>` | Override API root |
| `--token <token>` | Override token (prefer `ONE_MSG_TOKEN`) |
| `--json` | Print the API response body as JSON |
| `--no-color` | Disable ANSI color |
| `-h, --help` | Help for this command |
| `-v, --version` | Version (root only) |

`--json` is the **raw API body**. There is no `--raw`. The one CLI-built object is `channel info --json`: `{ "status": <GET /status>, "me": <GET /me> }`.

### Shared destination flags

Used by send-like commands unless a command says otherwise. Exactly one of `--to` or `--chat-id`. Exception: `message payment` is `--to` only (public schema has no `chatId`).

| Flag | Description |
|------|-------------|
| `--to <phone>` | Phone with country code, no `+` |
| `--chat-id <id>` | `phone@c.us` · `group@g.us` · `BSUID@lid` |
| `--quote <wamid>` | Reply to this message (`wamid.*`) |

Complex bodies (`template add`, interactive messages, calling SDP) take flags for scalars and `--from-file` for JSON (`-` = stdin).

---

## Commands

Every command answers `1msg <command> --help`. This section is the map and the examples; flags live in `--help`.

### `init`

Interactive setup: config file, live vs sandbox, instance, token (hidden), set as default. Writes mode `0600` and runs `1msg status` unless `--no-verify`.

```bash
1msg init
printf '%s' "$ONE_MSG_TOKEN" | 1msg init --name prod \
  --base-url https://api.1msg.io --instance-id ODI371267300 --token-stdin
```

### `channel`

Local named channels, plus remote status/settings of the selected channel.

| Subcommand | Where | What |
|------------|-------|------|
| `list` | local | Channels in the file (`*` = default). Columns: `default`, `name`, `instance_id`, `base_url`. Never `token`. |
| `use <name\|id>` | local | Set default channel |
| `add` | local | Add a channel (first channel becomes default unless `--default`) |
| `remove <name>` | local | Remove by **config name** only |
| `current` | local | Default name and instance id |
| `info` | API | `GET /status` then `GET /me` |
| `status` | API | `GET /status` (alias: `1msg status`) |
| `settings` / `settings set` | API | `GET/POST /settings` (only flags you pass are sent) |
| `mm-lite` | API | `GET /mmLiteStatus` |
| `automation` / `automation set` | API | Conversational automation |

```bash
1msg channel list
1msg channel use acme-prod
1msg channel info
1msg channel info --json
1msg -c acme-prod channel info --json
1msg channel settings set --ack-notifications --no-guaranteed-hooks
```

If either call in `channel info` fails, the CLI does not print a partial object: it emits that call's error and skips the second call.

### `status` / `me`

```bash
1msg status
1msg status --json
1msg me
1msg me update --about "Available 9–18" --email support@example.com
```

Human `status` is key-value: `status`, `accountStatus`, `mm_lite_available`.

### `send` / `message send`

Text or file inside the session window. Exactly one destination (`--to` or `--chat-id`) and exactly one body (`--text`, `--file`, or `--media-id`).

```bash
1msg send --to 12020721369 --text "Hello"
1msg send --chat-id 12020721369@c.us --text "Hello" --quote wamid.HBgN…
1msg send --to 12020721369 --file ./photo.jpg --caption "Look"
1msg send --to 12020721369 --file https://example.com/a.pdf --filename invoice.pdf
1msg send --to 12020721369 --media-id 123456 --media-type image
```

A local `--file` is read from disk, encoded as a data URI, and sent as `sendFile.body`. An `https` URL is passed through and **requires `--filename`**. This does not call `uploadMedia` unless you run `1msg media upload` yourself.

Root `1msg send` is only `sendMessage` + `sendFile`. The other public send operations are under `1msg message` and `1msg template send`.

Human send output:

```
sent  true
id    gBGGeRhGZTEfAgkJCh2wAz4ZH-8
to    12020721369@c.us
```

### `message`

| Command | API | Notes |
|---------|-----|-------|
| `send` | `POST /sendMessage` or `/sendFile` | Same as `1msg send` |
| `list` | `GET /messages` | Inbox history. Columns: `time`, `chat_id`, `from`, `type`, `id`, `body` (body truncated to 60). If the API returns `notice` and no rows, print the notice and exit 0. |
| `read` | `POST /readMessage` | `--message-id` only; no chat id. `--typing` = typing indicator (max 25s) |
| `react` | `POST /sendReaction` | `--emoji` → API `body`; `--message-id` → `quotedMsgId`. Empty emoji removes the reaction |
| `location` | `POST /sendLocation` | `--lat` / `--lng` |
| `location-request` | `POST /sendLocationRequest` | Optional `--text` |
| `contact` | `POST /sendContact` | Flags or `--from-file` |
| `buttons` | `POST /sendButton` | `--button id:title` repeatable, max 3. Interactive header only via `--from-file` |
| `menu` | `POST /sendList` | WhatsApp list. `--from-file` required (`sections[]`) |
| `carousel` | `POST /sendCarousel` | `--from-file` with `cards[]` and/or `params[]`. Carousel **outside** 24h is `template send --params`, not this command |
| `product` | `POST /sendProduct` | `--catalog-id` + `--product-id`, or `--from-file` for lists |
| `cta` | `POST /sendCtaUrl` | `--text` / `--button` / `--url` |
| `address` | `POST /sendAddressMessage` | India and Singapore only (`--country IN\|SG`) |
| `order` | `POST /sendOrderDetails` | India payments; `--from-file` for order body |
| `payment` | `POST /sendPaymentRequest` | `--to` + `--region IN\|SG\|BR` only (no `--chat-id`) |
| `sticker` | `POST /sendSticker` | Exactly one of `--link`, `--media-id`, `--file` |
| `flow` | `POST /sendFlow` | Session window. Outside 24h send a template with a FLOW button |

```bash
1msg message list --chat-id 12020721369@c.us --limit 20 --last
1msg message read --message-id wamid.… --typing
1msg message react --to 12020721369 --message-id wamid.… --emoji "👍"
1msg message location --to 12020721369 --lat 55.7558 --lng 37.6173 \
  --name "Red Square" --address "Moscow"
1msg message buttons --to 12020721369 --text "Choose:" \
  --button yes:Yes --button no:No
1msg message menu --to 12020721369 --from-file menu.json
1msg message cta --to 12020721369 --text "See details" \
  --button "Open site" --url https://example.com
```

### `template`

Work outside the 24-hour session window.

```bash
1msg template list
1msg template list --sort name --json
1msg template send --to 12020721369 --name hello_world --lang en \
  --params '[{"type":"body","parameters":[{"type":"text","text":"Ivan"}]}]'
1msg template add --from-file hello_world.json
1msg template remove --name hello_world
```

`template list` columns: `name`, `status`, `language`, `category`, `id`. Footer: `total N`. `--params` is a Cloud API **components array**, not a string list. `--from-file` on `add` is required and must include `components[]`.

A successful `template list` writes a completion cache of template names (see [Shell completion](#shell-completion)).

### `media`

```bash
1msg media upload --file ./photo.jpg
1msg media upload --url https://example.com/a.pdf
1msg media get --id 123456
1msg media delete --id 123456
```

Public `uploadMedia` accepts a URL or a data URI, not multipart. `media get` returns metadata plus a temporary URL (~5 min). `POST /deleteMedia` (`deleteMediaLegacy`) is not exposed.

### `group`

`group-id` is the WABA group id **without** `@g.us`.

```bash
1msg group list
1msg group create --name "Support team" --description "Customer support"
1msg group get 120363046942338209
1msg group update 120363046942338209 --subject "Support"
1msg group invite-link 120363046942338209
1msg group invite-link reset 120363046942338209
1msg group delete 120363046942338209
```

List columns: `id`, `subject`.

### `flow`

WhatsApp Flows and the business encryption key. Some endpoints currently return HTTP 501 until the Meta Graph Flows rewrite is available — the CLI still exposes them and prints the API error.

```bash
1msg flow list
1msg flow create --name lead_form --category LEAD_GENERATION
1msg flow get FLOW123
1msg flow publish FLOW123
1msg flow assets FLOW123 --json-file flow.json
1msg flow encryption
1msg flow encryption set --pem-file business.pem
```

List columns: `id`, `name`, `status`, `categories` (comma-joined).

### `webhook`

```bash
1msg webhook get
1msg webhook set --url https://example.com/webhook
1msg webhook set --url https://a.example/hook --url https://b.example/hook
1msg webhook clear
```

`set` **replaces** the stored list (max 5). It does not append. `clear` calls `POST /settings` with an empty `webhookUrl` (`setWebhook` rejects empty).

### `user`

```bash
1msg user blocked
1msg user block --to 12020721369
1msg user unblock --to 12020721369
```

Blocked-list column: `phone` (first present of `phone`, `wa_id`, `id`).

### `catalog`

```bash
1msg catalog get
1msg catalog set --cart --visible
1msg catalog set --no-cart --no-visible
```

`set` sends both `is_cart_enabled` and `is_catalog_visible` (required by the API). Fails when the WABA has no catalog linked — that is an account limit, not a CLI bug. Columns: `id`, `cart`, `visible` (`true`/`false`).

### `call`

WhatsApp Calling API (beta). 1MSG proxies **signaling only**. Real media needs your own WebRTC or SIP stack. Trial / `subscriptionBlocked` → HTTP 403.

```bash
1msg call settings
1msg call settings set --from-file calling.json
1msg call connect --to 12185552828 --sdp-file offer.sdp
1msg call pre-accept --call-id wacid.ABGG… --sdp-file answer.sdp
1msg call accept --call-id wacid.ABGG… --sdp-file answer.sdp
1msg call reject --call-id wacid.ABGG…
1msg call hangup --call-id wacid.ABGG…
```

All call-control commands `POST /initiateCall`. The CLI always sets `messaging_product=whatsapp`. Do not echo Meta's offer SDP as the answer.

### `version`

```bash
1msg version
1msg -v
```

Prints the CLI version and the `@1msg/sdk` version used for HTTP.

---

## Output

Default (no `--json`): tables or key-value with **stable column names**. Extra API fields are omitted from the table and appear only with `--json`.

Empty list: print `No rows.` to stderr and exit 0.

`--json`: exact API response body (pretty-printed). Successful JSON output strips token-like keys. API error `--json` is the raw server body.

`channel info --json` is the only CLI-built envelope:

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

A single endpoint remains `1msg status --json` / `1msg me --json`.

---

## Errors and exit codes

Public API errors are `{ "error": "<string>" }` plus HTTP status. There is no `code` field — the CLI does not invent names like `TOKEN_EXPIRED`. Human output shows the HTTP status.

Human output: message + `(HTTP <status>)` + optional hint. `--json` on an API error prints the **raw server body** (no CLI envelope). Usage errors (no HTTP) print `{ "error": "<string>" }` and exit 1.

```
$ 1msg send --to 12020721369 --text "Hello"
Error: invalid or expired token (HTTP 401)
Hint: set ONE_MSG_TOKEN or run `1msg init`

$ 1msg send --text "Hello"
Error: missing destination: pass --to or --chat-id
See:  1msg send --help

$ 1msg send --to 12020721369 --text "Hello" --file ./a.jpg
Error: pass exactly one of --text, --file, or --media-id

$ 1msg -c missing status
Error: channel "missing" not in config
See:  1msg channel list
```

| Exit | Meaning |
|------|---------|
| `0` | OK |
| `1` | Usage |
| `2` | API 4xx |
| `3` | API 5xx |
| `4` | Network |
| `5` | Not configured (`1msg init`) |

---

## Shell completion

Print a script to stdout. The CLI never writes into `/etc` or `$fpath` by itself — redirect, then reload the shell.

```bash
1msg completion bash
1msg completion zsh
1msg completion powershell
```

What is completed:

| Kind | Source |
|------|--------|
| Commands, subcommands, flags | Always, from the command tree |
| Channel names (`-c` / `--channel` / `channel use` / `remove`) | Keys of `channels:` in the config file (local, no API) |
| Template names (`template send --name`, `template remove --name`) | Cache written after a successful `1msg template list` |
| Flow ids / group ids | Not cached; type them |

Template cache:

| OS | Path |
|----|------|
| Linux / macOS | `~/.cache/1msg/completion.json` |
| Windows | `%LOCALAPPDATA%\1msg\completion.json` |

Shape: `{ "updated_at": "<iso>", "channel": "<config name>", "templates": ["hello_world", …] }`. Cache is per default channel name; after `channel use`, run `template list` again or names may be stale. Completing `--name` with no cache: no values (commands/flags still complete).

**Bash** (user, no sudo):

```bash
mkdir -p ~/.local/share/bash-completion/completions
1msg completion bash > ~/.local/share/bash-completion/completions/1msg
# then: source ~/.bashrc
```

Linux system: `1msg completion bash | sudo tee /etc/bash_completion.d/1msg`.  
macOS Homebrew: `1msg completion bash > "$(brew --prefix)/etc/bash_completion.d/1msg"`.

**Zsh:**

```bash
mkdir -p ~/.zsh/completions
1msg completion zsh > ~/.zsh/completions/_1msg
```

Once in `~/.zshrc`:

```zsh
fpath=($HOME/.zsh/completions $fpath)
autoload -U compinit && compinit
```

Then `exec zsh`. Do not write to `${fpath[1]}` — that path is not stable.

**PowerShell:**

```powershell
$dir = Split-Path $PROFILE
New-Item -ItemType Directory -Force $dir | Out-Null
1msg completion powershell | Out-File -Encoding utf8 (Join-Path $dir 1msg.ps1)
```

Once in `$PROFILE`: `. (Join-Path (Split-Path $PROFILE) '1msg.ps1')`.

---

## API coverage

61 mapped public `operationId`s + explicit skip `deleteMediaLegacy` = all 62 operations in the public OpenAPI spec.

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
| `deleteMediaLegacy` | not exposed |

Local-only (no `operationId`): `init`, `channel list|use|add|remove|current`, `completion`, `version`.

All 17 public `send*` operations are mapped. Root `1msg send` is text/file only.

---

## Architecture

```text
OpenAPI YAML (1msg-api monorepo)
  └─► codegen
        ├─► NestJS controllers
        ├─► @1msg/sdk            ← HTTP + types (published npm)
        └─► @1msg/cli            ← commander + config + help; SDK client only
```

See [ARCHITECTURE.md](./ARCHITECTURE.md).

Coverage is asserted in the `1msg-api` monorepo: 61 mapped public `operationId`s + explicit `deleteMediaLegacy` skip = 62. `--help` text is snapshot-tested against the RFC.

---

## Development

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm test` | Jest unit tests (`--help` snapshots, precedence, SDK-only architecture) |
| `npm start` | Run `dist/index.js` |
| `npm pack --dry-run` | What npm would publish (`dist/`, this README, `ARCHITECTURE.md`, `LICENSE`) |

CI (`.github/workflows/ci.yml`): install, build, test, smoke `--help` / `version`, `npm pack --dry-run`.

Publish: tag `v*` on this repo, or the `1msg-api` workflow **Publish @1msg/cli** (checks out this repository). Required secret: `NPM_TOKEN`.

Do not add a generator that emits one command per `operationId`. Do not call the API except through `@1msg/sdk`.

---

## Related

- [1MSG API docs](https://docs.1msg.io/)
- [`@1msg/sdk`](https://www.npmjs.com/package/@1msg/sdk) — TypeScript client
- [`@1msg/mcp`](https://www.npmjs.com/package/@1msg/mcp) / [`1msg/1msg-mcp`](https://github.com/1msg/1msg-mcp) — MCP server on the same SDK
- Design RFC (flag contract): `1msg-api/docs/CLI.md`

---

## License

MIT
