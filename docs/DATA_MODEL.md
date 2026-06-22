# Data Model

Ownly uses your Obsidian Vault as the database. Every record is a plain `.md` file with YAML frontmatter.

## Object Types and Schema

Ownly manages entities using the following types:

1. **Physical Objects**
   - Current CLI/Type: `physical`
   - Legacy Name: `physical_asset` (you may still see this in older files or legacy code, but new implementations favor `physical`).
   - Fields: `id`, `object_type`, `title`, `amount`, `category`, `status` (`observing`, `purchased`, `using`, `idle`, `transferred`, `discarded`), `purchased_at`, `ended_at`.

2. **Recurring Costs (Subscriptions)**
   - Type: `recurring_cost`
   - Fields: `id`, `object_type`, `title`, `amount`, `billing_cycle`, `billing_day`, `status` (`active`, `paused`, `cancelled`).

3. **One-Time Experiences**
   - Type: `one_time_experience`
   - Fields: `id`, `object_type`, `title`, `amount`, `status` (`planned`, `in_progress`, `completed`, `reviewed`).

4. **Reviews**
   - Type: `review`
   - Fields: `id`, `type: review`, `target_id`, `summary`, `food_score`, `scenery_score`, `experience_score`.

5. **Snapshots**
   - Type: `snapshot`
   - Fields: `id`, `type: snapshot`, `date`, `assets`, `liabilities`, `month_end`.

## How Agents Read/Write Safely

To safely interact with Ownly data, **agents MUST use the CLI** (`npm run wyqd --`).
Do not bypass the CLI to directly edit Markdown files via file manipulation tools, as it risks corrupting the strict YAML frontmatter schemas.

The CLI validates the schema before writing. See `docs/AGENT_CLI_GUIDE.md` for CLI usage.
