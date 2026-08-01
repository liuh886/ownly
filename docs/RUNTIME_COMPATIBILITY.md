# Ownly Runtime Compatibility Matrix

Ownly exposes one product through three user-facing surfaces:

- hosted Web;
- installed PWA;
- Obsidian plugin.

All three surfaces use the data behavior contract **`ownly-local-markdown-v1`**. Plain Markdown with YAML frontmatter remains the source of truth. Platform adapters may differ only where browser and Obsidian APIs differ.

## Capability matrix

| Capability | Hosted Web | Installed PWA | Obsidian | Contract / exception |
|---|---:|---:|---:|---|
| Create, read, update | Yes | Yes | Yes | Shared repository and schema rules |
| Archive and restore | Yes | Yes | Yes | Shared lifecycle and path rules |
| Permanent deletion from archive | Yes | Yes | Yes | Explicit destructive action |
| Physical items | Yes | Yes | Yes | Shared `physical` schema |
| Recurring costs | Yes | Yes | Yes | Shared `recurring_cost` schema |
| One-time experiences | Yes | Yes | Yes | Shared `one_time_experience` schema |
| Accounts | Data support | Data support | Data support | Account facts are supported; a full dedicated account editor is intentionally not exposed |
| Snapshots | Yes | Yes | Yes | Shared snapshot schema and calculations |
| Reviews | Yes | Yes | Yes | Shared review schema and reference checks |
| Object experience logs | Data support | Data support | Data support | Shared append-only log schema; a dedicated human log composer remains intentionally minimal |
| Select local data | Directory picker | Directory picker | Plugin setting / Vault | Platform-specific connection mechanism |
| Reconnect local data | Browser permission | Browser permission | Vault available while Obsidian is open | Browser permission may require renewal |
| First real object onboarding | Yes | Yes | Yes | Shared chooser and normal object creation path |
| Backup, restore, migration | Yes | Yes | Yes | Shared `data-portability.ts` correctness core |
| Language and currency | Yes | Yes | Yes | Shared i18n and formatting state |
| Doctor / data health | Yes | Yes | Yes | Shared deterministic Doctor core |
| Read source Markdown | Granted local folder | Granted local folder | Native Vault files | Obsidian can open files natively |
| Install prompt | Browser-controlled | Already installed | Not applicable | Launch capability, not data behavior |
| Offline application shell | Browser cache dependent | Yes | Native desktop app | Personal Markdown is never stored in the Web service-worker cache |

## Shared product invariants

The following must not diverge by runtime:

1. Entity schemas and validation.
2. Markdown/YAML serialization.
3. Calculated facts and metrics.
4. Entity identity and relationship semantics.
5. Archive, restore, and permanent-delete semantics.
6. Backup format, integrity checks, restore planning, rollback, and migration.
7. Doctor finding IDs and underlying rules.
8. First-object creation through the normal repository path.
9. Terminology defined in `docs/TERMINOLOGY.md`.

The typed source of truth is `src/core/runtime-capabilities.ts`.

## PWA rule

The PWA is the installed form of hosted Web. It does not have its own repository, schema, serializer, data shell, or migration implementation. PWA-only behavior is limited to:

- installation and standalone launch;
- cached application-shell startup;
- browser-managed offline and permission behavior.

CI rejects a separate PWA repository or PWA application shell.

## Intentional platform exceptions

### Browser folder permissions

Web and PWA use the File System Access API. The browser may require renewed access after restart, origin change, permission reset, or storage cleanup. This is not a data-model difference.

### Obsidian-native files

Obsidian can open, search, link, and edit the source Markdown through native Vault features. Web/PWA can only access files within the directory explicitly granted by the browser.

### Human editing surfaces

Ownly supports account and object-log facts across all adapters. Dedicated human editing screens remain intentionally limited. This is a product-scope decision, not silent adapter failure; CLI and Markdown remain available for complete fact access.

## Automated protection

`npm run test:runtime-parity` runs one controlled fixture through all three surface contracts and compares:

- serialized and parsed facts;
- schema validation;
- home metrics;
- archive and restore outcomes;
- Doctor findings;
- backup validation and migration results.

`npm run validate:runtime-parity` verifies the committed matrix, typed contract, and PWA architecture rule. Both commands run in the main validation gate.

Any future intentional exception must update:

1. `src/core/runtime-capabilities.ts`;
2. this matrix;
3. runtime parity tests;
4. release documentation.
