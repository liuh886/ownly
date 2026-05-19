# WYQD Release Readiness

This document tracks the gap between the current local-first MVP and a mature web/local-first product that is safe to share publicly, publish on GitHub, and rely on for real personal data.

## Current Release Stage

Status: local-first MVP+.

WYQD is no longer a throwaway prototype: it has a working information architecture, Markdown data model, Web UI, Agent CLI, PM2/static deployment path, and documented product intent.

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
- [x] Add a sample Vault fixture for repeatable demo and QA.

## Mature Product Readiness Checklist

- [x] Add product icons and app manifest foundation.
- [x] Add visible privacy and local-data documentation.
- [x] Add E2E tests for core flows.
- [x] Add recoverable archive behavior for delete actions.
- [x] Add restore flow for archived data.
- [x] Add sample Vault fixture for repeatable demos and QA.
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

The next maturity jump should focus on E2E coverage, sample Vault data, restore support, and clearer user-facing documentation.
