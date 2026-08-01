# Contributing to Ownly

Ownly is a local-first decision ledger for possessions, subscriptions, and experiences. Obsidian is a recommended interface, but hosted Web and installed PWA are first-class entry points over the same Ownly data.

## Development

Install dependencies:

```bash
npm install
```

Run the Web app:

```bash
npm run dev
```

Build and validate Web/PWA, Obsidian, CLI, and shared data contracts:

```bash
npm run validate
```

## Runtime compatibility

Read [docs/RUNTIME_COMPATIBILITY.md](docs/RUNTIME_COMPATIBILITY.md) before changing runtime behavior.

Ownly uses one data behavior contract: `ownly-local-markdown-v1`.

- Hosted Web and installed PWA are the same browser data runtime.
- Obsidian is a thin Vault I/O adapter over shared product rules.
- Shared domain logic belongs in `src/core`, `src/domain`, `src/data`, or shared services.
- Do not introduce separate runtime schemas, serializers, calculations, lifecycle rules, Doctor checks, or migration rules.
- Do not create a PWA-specific repository or application shell.
- Add intentional platform differences to the typed capability matrix and compatibility documentation.

Run the focused gates:

```bash
npm run validate:runtime-parity
npm run test:runtime-parity
```

## Data safety

Ownly stores user data as plain local Markdown. Contributions must not encrypt, lock, delete, upload, or block export of user data based on license state.

Use recoverable archive behavior for destructive user actions whenever possible. Storage and schema changes must use the shared versioned backup, restore, and migration core.

## Product boundary

Ownly provides fact-ready data for humans, scripts, and external agents. Do not add AI chat, model APIs, embeddings, generated recommendations, cloud accounts, or mandatory synchronization as incidental changes.
