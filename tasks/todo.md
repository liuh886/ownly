# Planner Execution Model — PR #128

## Completed in this PR

- [x] Add canonical `scheduled_start` (`HH:mm`) to Planner place state; derive end time from duration.
- [x] Treat MCP client / LLM as the AI planner; remove the built-in deterministic pseudo-AI generator.
- [x] Add deterministic schedule-proposal validation before prepare/commit.
- [x] Preserve locked and anchor stops as hard constraints.
- [x] Keep accepted AI suggestions unlocked until the user explicitly pins them.
- [x] Detect exact timed overlaps without inventing transit time.
- [x] Export iCal Pro as a one-way projection from Planner/Vault only.
- [x] Delete reverse iCal → Planner parsing and arbitrary custom calendar writes.
- [x] Never invent missing start times, durations, or universal transit buffers.
- [x] Expose richer trip facts through MCP so external clients can reason from rating/review/price/hours/coordinates/anchors.

## Boundary

```text
Capture → Planner/Vault → MCP proposal → deterministic validation → prepare/commit → iCal projection
```

Planner/Vault remains the only schedule authority. Calendar output is derived.
