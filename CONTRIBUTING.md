# Contributing to WYQD

WYQD is currently a private alpha project focused on an Obsidian-native, local-first decision ledger.

## Development

Install dependencies:

```bash
npm install
```

Run the Web app:

```bash
npm run dev
```

Build and validate both Web and Obsidian targets:

```bash
npm run validate
```

## Runtime Compatibility

Changes should preserve both supported runtimes:

- Web App: browser and static export flow
- Obsidian Plugin: Vault-native plugin package under `dist/obsidian/wyqd`

Shared domain logic belongs in `src/core`, `src/domain`, or shared services. Avoid duplicating business rules separately for Web and Obsidian.

## Data Safety

WYQD stores user data as Markdown in the user's Vault. Contributions must not encrypt, lock, delete, or block export of user data based on license state.

Use recoverable archive behavior for destructive user actions whenever possible.
