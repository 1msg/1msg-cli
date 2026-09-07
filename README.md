# @1msg/cli

Command-line client for the [1MSG](https://1msg.io) WhatsApp Business API — **61 public operations** (legacy `deleteMediaLegacy` is not exposed).

| | |
|--|--|
| **npm** | [`@1msg/cli`](https://www.npmjs.com/package/@1msg/cli) |
| **Binary** | `1msg` |
| **SDK** | [`@1msg/sdk`](https://www.npmjs.com/package/@1msg/sdk) |

API hosts:

| Environment | `ONE_MSG_BASE_URL` |
|-------------|--------------------|
| Live channels | `https://api.1msg.io` |
| Test channels | `https://sandbox.1msg.io` |

> Source of truth for the CLI implementation still lives in the `1msg-api` monorepo (`packages/cli`). This repository is the **distribution** package for `npx` / clone / npm.

## Quick start

```bash
npx -y @1msg/cli --help
npx -y @1msg/cli init
npx -y @1msg/cli status
```

Or install globally: `npm i -g @1msg/cli`.

### Clone and run

```bash
git clone https://github.com/1msg/1msg-cli.git
cd 1msg-cli
npm install
npm run build
node dist/index.js --help
```

## Config and environment

Config file: `~/.config/1msg/config.yaml` (Windows: `%AppData%\1msg\config.yaml`). Mode `0600`.

| Variable | Description |
|----------|-------------|
| `ONE_MSG_BASE_URL` | API root: `https://api.1msg.io` (live) or `https://sandbox.1msg.io` (test) |
| `ONE_MSG_INSTANCE_ID` | Channel instance id |
| `ONE_MSG_TOKEN` | Channel API token |
| `ONE_MSG_CHANNEL` | Named channel from the config file |

Deprecated aliases match MCP: `CHAT_API_*`, `TOKEN`, `INSTANCE_ID`.

Precedence: named channel (`--channel` / `ONE_MSG_CHANNEL` / `default_channel` / the only channel) → fill empty fields from env → flags win. A named channel token is not overwritten by leftover `ONE_MSG_TOKEN`. No config file + the three env vars = implicit CI channel.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm test` | Jest unit tests |
| `npm start` | Run `dist/index.js` |

## Architecture

All API HTTP goes through `@1msg/sdk`. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## License

MIT
