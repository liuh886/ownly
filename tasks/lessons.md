# Lessons & Guidelines

## Architecture & State Management Lessons
1. **Single Source of Truth (唯一权威)**: Never duplicate complex domain state (like trips, schedules, locks) across multiple storage layers (e.g. Chrome Extension local storage vs Obsidian/Markdown Vault). Keep the satellite service (Capture) as a lightweight transient Inbox.
2. **Single Writer in MV3 Extensions (MV3 单写者)**: In Chrome Extensions Manifest V3, always route storage mutations through the background service worker with sequential promise chaining (`workerOpChain`) to eliminate race conditions between sidepanels, popup, and content scripts.
3. **Non-Destructive Import / Field Merging (非破坏性合并)**: When importing external research candidates into canonical entities, preserve user decisions (schedule dates, priority, locks, tags, notes) and only refresh objective observed facts (ratings, open hours, prices, coordinates).
