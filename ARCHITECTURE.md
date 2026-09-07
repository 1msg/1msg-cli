# CLI package architecture

The `@1msg/cli` package **must not** call the 1MSG API directly.
All HTTP goes through [`@1msg/sdk`](https://www.npmjs.com/package/@1msg/sdk).

```text
OpenAPI YAML (1msg-api monorepo)
  └─► codegen
        ├─► NestJS controllers
        ├─► @1msg/sdk            ← HTTP + types (published npm)
        └─► @1msg/cli            ← commander + config + help; SDK client only
```

Commands are hand-mapped (verb + noun), not generated 1:1 from OpenAPI.
Coverage is asserted in the `1msg-api` monorepo: 61 mapped public
`operationId`s + explicit `deleteMediaLegacy` skip = 62.

`--help` text is frozen from the RFC in `1msg-api` (`docs/CLI.md`).

This repository is the **distribution** package. Implementation source of
truth remains `1msg-api/packages/cli`.
