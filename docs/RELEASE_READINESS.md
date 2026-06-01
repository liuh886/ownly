# Ownly Release Readiness

This document tracks the gap between the current local-first MVP+ and a mature Obsidian-native product that is safe to share publicly, publish on GitHub, submit to the Obsidian community plugin directory, and rely on for real personal data.

## Current Release Stage

Status: 1.0.0 Stable Release (Obsidian plugin first, Web compatible).

Ownly v1.0.0 is the first stable public release of the Obsidian plugin. It has a working information architecture, Markdown data model, Web UI, Obsidian plugin shell, Agent CLI, PM2/static deployment path, object list sorting and pagination, demo data auto-seeding, and documented product intent.

## GitHub Public Sharing Checklist

- [x] Product README exists.
- [x] App name is no longer `temp-app`.
- [x] Build does not depend on Google Fonts network access.
- [x] Agent CLI protocol is documented in `AGENTS.md`.
- [x] Privacy policy exists.
- [ ] Add screenshots or a short demo GIF (user to provide).
- [x] Add LICENSE after the owner decides the license model (MIT).
- [x] Add CHANGELOG before the first tagged release.
- [x] Add CONTRIBUTING if external contributions are expected.
- [x] Add a sample Vault fixture for repeatable demo and QA (`samples/wyqd-vault`).
- [ ] Create a GitHub release containing Obsidian release artifacts (ready — push `v1.0.0` tag).
- [ ] Submit to the Obsidian community plugin directory after plugin QA.

## Mature Product Readiness Checklist

- [x] Add product icons and app manifest foundation.
- [x] Add visible privacy and local-data documentation.
- [ ] Add E2E tests for Web core flows and Obsidian plugin smoke flows.
- [x] Add recoverable archive behavior for delete actions.
- [x] Add restore flow for archived data.
- [x] Add sample Vault fixture for repeatable demos and QA (`samples/wyqd-vault`).
- [ ] Add screenshots or a short demo GIF for GitHub sharing (user to provide).
- [x] Add release notes and versioning policy (`docs/VERSIONING.md`).
- [ ] Validate accessibility and responsive layout on real devices.
- [x] Document known browser limitations for File System Access API.

## Security And Reliability Notes

- `npm audit --omit=dev` currently reports moderate issues through Next's internal PostCSS dependency.
- The suggested `npm audit fix --force` is not acceptable because it would install an old, breaking Next version.
- Track this through Next upgrades instead of force-fixing blindly.

## New User Experience

As of v0.2.6, the web runtime auto-seeds demo data into an empty Vault on first connect. New users see 11 sample objects (physical items, subscriptions, travel experiences), 2 net worth snapshots, and 5 reviews immediately. The seeded data persists as real Markdown files in the Vault and can be freely edited or deleted. A `localStorage` flag (`ownly_demo_seeded`) prevents re-seeding users who intentionally clear their data.

## Release Decision

v1.0.0 is ready for GitHub release and Obsidian community plugin submission once screenshots are added. Push the `v1.0.0` tag to trigger the CI release workflow.

Remaining items for future releases: E2E tests, responsive layout validation on real devices.

## 2026-05-31 Release Closure Check

Status: `1.0.0` release closure passed.

Verified:

- `npm run validate` passed for TypeScript, ESLint, Web static build, Obsidian plugin type check, plugin package generation, and release file validation.
- `npm run wyqd -- --help` works as the documented Agent CLI entry.
- `samples/wyqd-vault` can be read by the Ownly CLI for object and snapshot demo data.
- `dist/obsidian/ownly` is generated with `manifest.json`, `versions.json`, `main.js`, and `styles.css`.
- Manual Obsidian installation QA completed in a real Vault.
- Object list sorting (date, price, title) and pagination (show more/less) verified.
- Version consistency across `package.json`, `manifest.json`, and `runtime.ts` at `1.0.0`.

Remaining items:

- Add screenshots to README.
- Push `v1.0.0` tag to create GitHub release.
- Submit to Obsidian community plugin directory.
