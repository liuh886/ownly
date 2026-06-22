# Ownly User Guide

Welcome to Ownly! This guide explains how to use the core features of the product to make better consumption decisions.

## 1. Home Dashboard
The Home dashboard is your high-level overview. It shows:
- **Total Net Worth**: The sum of your tracked assets minus liabilities (requires creating Snapshots).
- **Fixed Monthly Cost**: The sum of all active subscriptions and recurring costs.
- **Daily Cost**: The amortized daily cost of all active physical items and subscriptions.
- **Quick Entry**: A low-friction input box. Type a quick line like `MacBook / physical / 8000` to quickly draft an object.
- **Data Scale**: Diagnostics showing how many items are tracked and your database health.

## 2. Objects
The Objects tab is where you manage your physical items, subscriptions, and experiences.
- **Status Console**: The top control bar lets you filter objects by their lifecycle (e.g., Pending, In Use, Pending Review, Exited).
- **Physical Assets**: Track things you own. When you no longer use an item, you can "Retire" it.
- **Recurring Costs**: Track subscriptions. You can "Cancel" them here.
- **Experiences**: Track trips, dining, and events. Once finished, they move to the "Pending Review" state.

### Quick Entry Format Reference

The Quick Entry input accepts a one-line shorthand to fill all object fields at once. Fields are separated by `/`, `／`, `，`, `,`, `|`, or Tab. A parse preview shows what was recognized — you can still edit any field before saving.

#### Physical items
```
title / physical / price / purchase_date(YYYY-MM-DD) / end_date / category / status
```
Example: `Sony A7C / physical / 12000 / 2026-05-01 / 2026-05-17 / Camera / using`

Status values: `observing`, `purchased`, `using`, `idle`, `transferred`, `discarded` (Chinese also supported, e.g. `使用中`, `已退役`).

#### Recurring costs (subscriptions)
```
title / recurring_cost / amount / cycle / billing_day / payment_account / start_date / status / category
```
Example: `ChatGPT Plus / recurring_cost / 20 / monthly / 1 / Credit Card / 2026-01-01 / active / AI Tools`

Cycle values: `weekly`, `monthly`, `quarterly`, `annual`, `custom`. Status: `seeded`, `active`, `paused`, `cancelled`. `fixed` is accepted as an alias for `recurring_cost`.

#### Travel experiences
```
title / travel / budget / actual_cost / end_date / category / status / country_code / city / latitude / longitude
```
Example: `Tokyo trip / travel / 18000 / 16500 / 2026-05-04 / Travel / completed / JP / Tokyo / 35.6762 / 139.6503`

- Use `travel` or `旅行` for travel experiences (appears in Travel Insights).
- Use `experience` or `体验` for generic one-time experiences (dining, events, etc. — not shown in Travel Insights).
- `fixed` is an alias for `recurring_cost`.
- Legacy 10-field format (without city) defaults city to the title with a warning.

## 3. Snapshots (Accounts)
The Snapshots tab tracks your financial health over time.
- **Add Snapshot**: Enter your total assets and total liabilities on a specific date.
- **Trend Chart**: Visualizes your net worth trajectory based on historical snapshots.

## 4. Reviews
The Reviews tab holds your post-consumption reflections.
- When an object is retired, cancelled, or completed, you are prompted to write a review.
- Reviews help you capture *why* something was good or bad, creating a feedback loop for future purchases.
- Experiences can be rated on Food, Scenery, and Experience.
