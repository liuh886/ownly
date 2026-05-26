# WYQD Release Readiness

This document tracks the gap between the current local-first MVP+ and a mature Obsidian-native product that is safe to share publicly, publish on GitHub, submit to the Obsidian community plugin directory, and rely on for real personal data.

## Current Release Stage

Status: 0.2.0 Private Alpha (Obsidian plugin first, Web compatible).

WYQD is no longer a throwaway prototype, but it is currently positioned as a **Private Alpha**, not a stable release. It has a working information architecture, Markdown data model, Web UI, Obsidian plugin shell, Agent CLI, PM2/static deployment path, and documented product intent. It is suitable for 1-3 internal users to evaluate the "Alpha risk" profile.

The maturity benchmark is not mobile app-store listing. It is whether WYQD feels dependable, understandable, recoverable, testable, and shareable as a real product.

## GitHub Public Sharing Checklist

- [x] Product README exists.
- [x] App name is no longer `temp-app`.
- [x] Build does not depend on Google Fonts network access.
- [x] Agent CLI protocol is documented in `AGENTS.md`.
- [x] Privacy policy exists.
- [ ] Add screenshots or a short demo GIF.
- [ ] Add LICENSE after the owner decides the license model.
- [x] Add CHANGELOG before the first tagged release.
- [x] Add CONTRIBUTING if external contributions are expected.
- [x] Add a sample Vault fixture for repeatable demo and QA (`samples/wyqd-vault`).
- [ ] Create a GitHub release containing Obsidian release artifacts.
- [ ] Submit to the Obsidian community plugin directory after plugin QA.

## Mature Product Readiness Checklist

- [x] Add product icons and app manifest foundation.
- [x] Add visible privacy and local-data documentation.
- [ ] Add E2E tests for Web core flows and Obsidian plugin smoke flows.
- [x] Add recoverable archive behavior for delete actions.
- [x] Add restore flow for archived data.
- [x] Add sample Vault fixture for repeatable demos and QA (`samples/wyqd-vault`).
- [ ] Add screenshots or a short demo GIF for GitHub sharing.
- [ ] Add release notes and versioning policy.
- [ ] Validate accessibility and responsive layout on real devices.
- [x] Document known browser limitations for File System Access API.

## Security And Reliability Notes

- `npm audit --omit=dev` currently reports moderate issues through Next's internal PostCSS dependency.
- The suggested `npm audit fix --force` is not acceptable because it would install an old, breaking Next version.
- Track this through Next upgrades instead of force-fixing blindly.

## Release Decision

Public GitHub sharing is realistic after screenshots, license, sample data, and one more QA pass.

The next maturity jump should focus on E2E coverage, Obsidian installation QA, release artifacts, screenshots, and clearer plugin-first user-facing documentation.

## 2026-05-26 Release Closure Check

Status: local `0.2.0-alpha` release closure passed.

Verified:

- `npm run validate` passed for TypeScript, ESLint, Web static build, Obsidian plugin type check, plugin package generation, and release file validation.
- `npm run wyqd -- --help` works as the documented Agent CLI entry.
- `samples/wyqd-vault` can be read by the WYQD CLI for object and snapshot demo data.
- `dist/obsidian/wyqd` is generated with `manifest.json`, `versions.json`, `main.js`, and `styles.css`.

Remaining blockers before public Obsidian community submission:

- Confirm and add a project license.
- Perform manual Obsidian installation QA in a real Vault.
- Add screenshots or a short demo GIF.
- Create a GitHub release with Obsidian release artifacts.
