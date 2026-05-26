# Ownly Agent CLI Guide

This guide is for agents that need to operate Ownly data from natural language user instructions.

## Principle

Ownly has three synchronized data entry paths:

- Web UI for manual entry.
- Obsidian Markdown for direct human editing.
- Agent CLI for structured agent CRUD.

For agent work, prefer the CLI. It preserves the Markdown storage model while avoiding ad hoc frontmatter edits.

## Vault Resolution

In the Ductor container, the normal Vault path is:

```bash
/mnt/zhihaol
```

Use one of these forms:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object list --json
OWNLY_VAULT=/mnt/zhihaol node scripts/wyqd-cli.mjs object list --json
npm run --silent wyqd -- --vault /mnt/zhihaol object list --json
```

If the Vault path is unknown, ask the user before writing data.

## Object Commands

List objects:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object list
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object list --json
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object list --status idle --json
```

List upcoming recurring cost payments:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object due --days 30 --json
```

Use this when the user asks which subscriptions are about to renew, what will be charged soon,
or which fixed costs need attention this month.

Group active recurring costs by payment account:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object accounts --json
```

Use this when the user asks how much each card/account carries in monthly fixed costs.

Add a physical object:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object add \
  --title "小米13U" \
  --amount 5843 \
  --category "电子产品" \
  --purchased-at 2023-06-07 \
  --ended-at 2025-09-20 \
  --status "已退役"
```

Add a recurring cost with billing metadata:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object add \
  --title "ChatGPT Plus" \
  --object-type recurring_cost \
  --amount 20 \
  --currency USD \
  --billing-cycle annual \
  --billing-day 18 \
  --payment-account "招行信用卡" \
  --started-at 2026-05-01
```

Get one object:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object get --id <object_id>
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object get --title "小米13U"
```

Update an object:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object update --id <object_id> --amount 5800
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object update --id <object_id> --category "电子产品"
```

Retire an object:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object retire --id <object_id> --ended-at 2025-09-20
```

Cancel a recurring cost:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object cancel --id <object_id> --reason "使用频率低"
```

Only use `object cancel` for `recurring_cost` objects. It writes `status: cancelled`,
`cancelled_at`, `cancel_reason`, and preserves the Markdown body.

Delete an object:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object delete --id <object_id> --yes
```

Restore an archived object:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object restore --id <object_id>
```

Deletion is a recoverable archive operation. The CLI moves the original Markdown into
`Ownly/Archive/Objects` and adds `archived_at`, `archived_from`, and `original_file_name`
without dropping unknown frontmatter fields or body content. Restore moves it back to
`Ownly/Objects` and removes the archive metadata. Prefer `retire` when the user means the
asset is no longer in service.

## Snapshot Commands

Add an account snapshot:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol snapshot add \
  --date 2026-05-18 \
  --assets 100000 \
  --liabilities 20000 \
  --month-end
```

List snapshots:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol snapshot list --json
```

Update or delete snapshots:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol snapshot update --id <snapshot_id> --assets 120000
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol snapshot delete --id <snapshot_id> --yes
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol snapshot restore --id <snapshot_id>
```

Snapshot deletion moves the note to `Ownly/Archive/Snapshots`.

## Review Commands

Add a review:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol review add \
  --summary "本月冲动消费下降，电子产品使用成本可接受" \
  --regret-score 2
```

List reviews:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol review list --json
```

Update or delete reviews:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol review update --id <review_id> --summary "更新后的复盘"
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol review delete --id <review_id> --yes
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol review restore --id <review_id>
```

Review deletion moves the note to `Ownly/Archive/Reviews`.

## Agent Workflow

1. Parse the user's natural language intent into entity type, action, and fields.
2. For updates, retirements, and deletions, resolve the entry with `list --json`, `get --id`, or `get --title`.
3. If more than one entry matches, ask for clarification instead of guessing.
4. Run the CLI command.
5. For writes, run a follow-up `get` or `list --json` to verify the result.
6. For deletes, report that the item is archived and can be restored with the matching `restore` command.
7. Report the changed entity and key fields back to the user.

## Status Mapping

Physical object statuses:

- `observing`: 观察中
- `purchased`: 已购买
- `using`: 服役中
- `idle`: 已退役
- `transferred`: 已卖出
- `discarded`: 已丢弃

Chinese status labels are accepted by the CLI where supported.

## Common Natural Language Examples

User: "帮我录入小米13U，购买日期2023-06-07，退役日期2025-09-20，购买价格5843，电子产品类。"

Command:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object add --title "小米13U" --amount 5843 --category "电子产品" --purchased-at 2023-06-07 --ended-at 2025-09-20 --status "已退役"
```

User: "查一下所有已退役资产。"

Command:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object list --status idle --json
```

User: "把小米13U删除。"

Commands:

```bash
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object get --title "小米13U"
node scripts/wyqd-cli.mjs --vault /mnt/zhihaol object delete --id <object_id> --yes
```

This archives the file instead of permanently deleting it.
