# Troubleshooting

If Ownly stops functioning properly, or your data appears corrupted, follow these steps to diagnose and resolve the issue.

## 1. Using the Doctor Tool

Ownly includes a built-in "Doctor" tool to check the health of your Markdown database. It scans all files for schema violations, duplicate IDs, missing references, and invalid states.

If you suspect data corruption:
1. Open your terminal in the Ownly plugin directory.
2. Run the Doctor CLI command:
   ```bash
   npm run wyqd -- doctor
   ```
3. The output will list warnings or errors (e.g., missing fields, invalid status). Open the respective `.md` files in Obsidian and manually correct the YAML frontmatter.

## 2. Checking Agent Logs

If an AI agent recently modified your data and things broke, you can check the audit log. Every CLI write operation logs the before and after JSON snapshots.
- **Log Location**: `Ownly/Logs/agent_operations.log` inside your Obsidian Vault.
- Review this file to see exactly what changed.

## 3. Recovering Archived Data

Ownly soft-deletes files by moving them to the `Ownly/Archive/` directory and appending archive metadata to the frontmatter.
- If you accidentally deleted something, simply find it in the archive folder, remove the `archived_at` fields, and move the file back to its original folder (e.g., `Ownly/Objects/`).
- Or, use the CLI: `npm run wyqd -- object restore --id <id>`.

## 4. UI / Display Issues

If the UI fails to render:
- Ensure your Obsidian is up to date.
- Open the Developer Tools in Obsidian (`Ctrl+Shift+I` or `Cmd+Option+I`) and check the Console tab for React or parsing errors.
- If a specific file is causing the crash, move files out of the `Ownly/` folder one by one until the UI recovers to isolate the problematic file.
