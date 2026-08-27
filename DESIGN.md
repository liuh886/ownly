> Capability Router Protocol
> This file is a long-lived project state file.
> Do not rewrite this file wholesale.
> Only append new entries or edit explicitly conflicting fields after user confirmation.
> If a request conflicts with existing content, surface the conflict first.

# Design Log

## sidepanel.ts Refactor Plan
- **Goal**: Break down 1800+ lines into modular files.
- **Architecture**: 
  - src/extension/i18n.ts: Localization dictionary and language switching.
  - src/extension/dom.ts: Element bindings, UI helpers (setStatus, rendering chips).
  - src/extension/store.ts: Global state management (loadState, saveState, in-memory flags).
  - src/extension/api.ts: External network calls (resolveGoogleMapsListByUrl).
  - src/extension/sidepanel.ts: Main entry point orchestrating event listeners.
