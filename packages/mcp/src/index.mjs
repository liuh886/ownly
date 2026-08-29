import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {
  getOwnlyDoctor,
  getOwnlyObject,
  getOwnlyObjectHistory,
  getOwnlyRecurringByAccount,
  getOwnlyRecurringCosts,
  getOwnlyRecurringDue,
  getOwnlyReviewNeeded,
  getOwnlySummary,
  resolveOwnlyDataLocation,
  searchOwnly,
  toOwnlyMcpErrorPayload,
} from '../../../scripts/mcp/ownly-tools.ts';
import { OwnlyWriteService } from '../../../scripts/shared/ownly-write-service.ts';
import {
  getPlannerSummary,
  getPlannerTripDetail,
  getPlannerTripICalMarkdown,
} from '../../../scripts/mcp/planner-tools.ts';

const SERVER_NAME = 'ownly';
const SERVER_VERSION = '0.3.1';
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const PREPARE_WRITE_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const COMMIT_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
const OBJECT_STATUS = z.enum([
  'seeded',
  'observing',
  'purchased',
  'using',
  'idle',
  'transferred',
  'discarded',
  'active',
  'paused',
  'cancelled',
  'planned',
  'in_progress',
  'completed',
  'reviewed',
]);

function parseServerArgs(argv, env) {
  let dataDir = env.OWNLY_DATA_DIR;
  let allowWrite = ['1', 'true', 'yes'].includes(String(env.OWNLY_MCP_ALLOW_WRITE ?? '').toLowerCase());
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--allow-write') {
      allowWrite = true;
      continue;
    }
    if (token.startsWith('--data-dir=')) {
      dataDir = token.slice('--data-dir='.length);
      continue;
    }
    if (token === '--data-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--data-dir requires a path.');
      }
      dataDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return { dataDir, allowWrite, help };
}

function printHelp() {
  process.stdout.write(`Ownly MCP\n\nUsage:\n  ownly-mcp --data-dir <vault-or-data-root> [--allow-write]\n\nEnvironment:\n  OWNLY_DATA_DIR=<vault-or-data-root>\n  OWNLY_MCP_ALLOW_WRITE=1\n\nThe data folder defaults to Ownly/ under the configured path. Pass a custom Ownly data root directly when its Objects/ directory is at the root. Writes are disabled unless explicitly enabled and always require prepare + commit.\n`);
}

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(error) {
  const payload = toOwnlyMcpErrorPayload(error);
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: { error: payload },
    isError: true,
  };
}

function safeHandler(handler) {
  return async (args) => {
    try {
      return toolResult(await handler(args));
    } catch (error) {
      return toolError(error);
    }
  };
}

export function createOwnlyMcpServer(dataLocation, options = {}) {
  const writeService = new OwnlyWriteService(dataLocation, { allowWrite: options.allowWrite });
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Ownly is a local-first evidence source. Use Doctor before high-stakes analysis when data quality matters. Treat tool results as recorded facts and keep recommendations or interpretations clearly separate from those facts. Persistent mutations use two phases: call an ownly_prepare_* tool, show the preview to the user, then call ownly_commit_operation only after confirmation. Writes must also be enabled when the server starts. Planner tools follow the same discipline: MCP clients/LLMs may propose schedules, but Ownly validates hard constraints and persists only confirmed decisions through planner_prepare_* + commit. Never invent missing start times, durations, prices, or transit facts; never silently overwrite locked/anchored stops; convert foreign prices only for display using trip fx_rates. Do not claim that all Ownly data stays outside the model context: only the source-of-truth remains local; returned tool results are shared with this MCP client.',
    },
  );

  server.registerTool(
    'ownly_summary',
    {
      title: 'Ownly Summary',
      description: 'Return a compact overview of the local Ownly evidence store and its deterministic health status.',
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(() => getOwnlySummary(dataLocation)),
  );

  server.registerTool(
    'ownly_search',
    {
      title: 'Search Ownly',
      description: 'Search validated Ownly object facts by title, category, or local Markdown body without returning the raw Markdown body.',
      inputSchema: z.object({
        query: z.string().min(1),
        object_type: z.enum(['physical', 'recurring_cost', 'one_time_experience']).optional(),
        status: OBJECT_STATUS.optional(),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ query, object_type, status }) => searchOwnly(dataLocation, query, {
      objectType: object_type,
      status,
    })),
  );

  server.registerTool(
    'ownly_get_object',
    {
      title: 'Get Ownly Object',
      description: 'Return bounded structured facts for one Ownly object identified by its stable Ownly ID.',
      inputSchema: z.object({ id: z.string().min(1) }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ id }) => getOwnlyObject(dataLocation, id)),
  );

  server.registerTool(
    'ownly_object_history',
    {
      title: 'Ownly Object History',
      description: 'Return one object with linked reviews and chronological append-only experience logs for evidence-grounded reasoning.',
      inputSchema: z.object({ id: z.string().min(1) }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ id }) => getOwnlyObjectHistory(dataLocation, id)),
  );

  server.registerTool(
    'ownly_recurring_costs',
    {
      title: 'Ownly Recurring Costs',
      description: 'List structured recurring-cost facts. Defaults to active subscriptions only and preserves currency semantics.',
      inputSchema: z.object({
        active_only: z.boolean().default(true),
        category: z.string().min(1).optional(),
        account: z.string().min(1).optional(),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ active_only, category, account }) => getOwnlyRecurringCosts(dataLocation, {
      activeOnly: active_only,
      category,
      account,
    })),
  );

  server.registerTool(
    'ownly_recurring_due',
    {
      title: 'Ownly Recurring Due',
      description: 'Return active recurring costs with a calculable billing date inside a bounded future horizon.',
      inputSchema: z.object({
        days: z.number().int().min(0).max(365).default(30),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ days }) => getOwnlyRecurringDue(dataLocation, days)),
  );

  server.registerTool(
    'ownly_recurring_by_account',
    {
      title: 'Ownly Recurring Costs by Account',
      description: 'Group active recurring costs by payment account. Monetary totals remain separated by currency instead of being silently combined.',
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(() => getOwnlyRecurringByAccount(dataLocation)),
  );

  server.registerTool(
    'ownly_review_needed',
    {
      title: 'Ownly Review Needed',
      description: 'Return objects that deterministically require review under the existing Ownly lifecycle rules.',
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(() => getOwnlyReviewNeeded(dataLocation)),
  );

  server.registerTool(
    'ownly_doctor',
    {
      title: 'Ownly Doctor',
      description: 'Run deterministic, read-only integrity checks before an agent relies on the local evidence store.',
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(() => getOwnlyDoctor(dataLocation)),
  );

  // ── Planner: travel research & scheduling ─────────────────────────────

  server.registerTool(
    'ownly_planner_summary',
    {
      title: 'Planner Summary',
      description: 'Overview of all trips with place counts (scheduled/candidates/dropped) and expense counts.',
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(() => getPlannerSummary(dataLocation)),
  );

  server.registerTool(
    'ownly_planner_get_trip',
    {
      title: 'Planner Trip Detail',
      description: 'Full trip context: trip, budget estimate in base currency with FX, day conflicts (opening hours), places, bookings and expenses.',
      inputSchema: z.object({ trip_id: z.string().min(1) }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ trip_id }) => getPlannerTripDetail(dataLocation, trip_id)),
  );

  server.registerTool(
    'ownly_planner_budget_estimate',
    {
      title: 'Planner Budget Estimate',
      description: 'Estimate the scheduled-trip budget converted into the trip base currency. Uses built-in USD-pivot rates unless the trip defines fx_rates overrides.',
      inputSchema: z.object({ trip_id: z.string().min(1) }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ trip_id }) => {
      const detail = getPlannerTripDetail(dataLocation, trip_id);
      return { budget: detail.budget, conflicts: detail.conflicts };
    }),
  );

  server.registerTool(
    'ownly_planner_prepare_schedule_place',
    {
      title: 'Preview Scheduling a Place',
      description: 'Preview scheduling a planner place on a date (locks it as a hard constraint for later optimization).',
      inputSchema: z.object({
        place_id: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sort_order: z.number().int().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ place_id, date, sort_order }) => writeService.prepareSchedulePlace(place_id, date, sort_order)),
  );

  server.registerTool(
    'ownly_planner_prepare_return_to_pool',
    {
      title: 'Preview Returning a Place to Pool',
      description: 'Preview moving a scheduled place back to the candidate pool.',
      inputSchema: z.object({ place_id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ place_id }) => writeService.prepareReturnPlaceToPool(place_id)),
  );

  server.registerTool(
    'ownly_planner_prepare_reorder_day',
    {
      title: 'Preview Reordering a Day',
      description: 'Preview moving a scheduled place one position up (-1) or down (+1) within its day.',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        place_id: z.string().min(1),
        delta: z.union([z.literal(-1), z.literal(1)]),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ date, place_id, delta }) => writeService.prepareReorderDay(date, place_id, delta)),
  );

  server.registerTool(
    'ownly_planner_prepare_optimize_route',
    {
      title: 'Preview Day Route Optimization',
      description: 'Preview TSP re-ordering of one scheduled day (locked and coordinate-less stops stay pinned). Preview includes km saved.',
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ date }) => writeService.prepareOptimizeDayRoute(date)),
  );

  server.registerTool(
    'ownly_planner_prepare_set_stay_span',
    {
      title: 'Preview Setting Stay Span',
      description: 'Preview anchoring a hotel across consecutive dates; stale stay anchors on those dates are retired automatically.',
      inputSchema: z.object({
        hotel_place_id: z.string().min(1),
        dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ hotel_place_id, dates }) => writeService.prepareSetStaySpan(hotel_place_id, dates)),
  );

  server.registerTool(
    'ownly_planner_prepare_drop_place',
    {
      title: 'Preview Dropping a Place',
      description: 'Preview marking a place as dropped (terminal lifecycle state, recoverable by editing Markdown).',
      inputSchema: z.object({ place_id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ place_id }) => writeService.prepareDropPlannerPlace(place_id)),
  );

  server.registerTool(
    'ownly_planner_prepare_add_expense',
    {
      title: 'Preview Adding an Expense',
      description: 'Preview appending an AA-ledger expense entry to Trip Expenses/.',
      inputSchema: z.object({
        id: z.string().min(3),
        trip_id: z.string().min(1),
        title: z.string().min(1),
        category: z.enum(['stay', 'food', 'transit', 'ticket', 'shopping', 'other']),
        amount: z.number().positive(),
        currency: z.string().min(2).max(6),
        paid_by: z.string().min(1),
        split_members: z.array(z.string()).default([]),
        notes: z.string().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((input) => writeService.prepareAddExpense({
      ...input,
      created_at: new Date().toISOString(),
    })),
  );

  server.registerTool(
    'ownly_planner_prepare_set_fx_rates',
    {
      title: 'Preview Setting FX Rates',
      description: 'Preview persisting user-verified conversion overrides on the trip frontmatter (rates[FROM] = base per 1 FROM).',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        rates: z.record(z.string(), z.number().positive()),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ trip_id, rates }) => writeService.prepareSetFxRates(trip_id, rates)),
  );

  server.registerTool(
    'ownly_planner_get_ical_markdown',
    {
      title: 'Planner iCal Pro Projection',
      description: 'Project confirmed Planner/Vault schedule facts into obsidian-ical-plugin-pro Markdown. Missing start times or durations are never invented.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        language: z.enum(['zh', 'en']).optional(),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ trip_id, language }) => getPlannerTripICalMarkdown(dataLocation, trip_id, { language })),
  );

  server.registerTool(
    'ownly_planner_prepare_apply_schedule_proposal',
    {
      title: 'Preview Schedule Proposal',
      description: 'Validate and preview an MCP client/LLM schedule proposal. Locked or anchored stops cannot be changed; accepted AI decisions remain unlocked until the user explicitly pins them.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        places: z.array(z.object({
          id: z.string().min(1),
          scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          scheduled_start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
          sort_order: z.number().int().nonnegative(),
          duration_minutes: z.number().int().positive().max(1440).optional(),
        })).min(1),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ trip_id, places }) => writeService.preparePlannerApplyScheduleProposal(trip_id, { places })),
  );

  server.registerTool(
    'ownly_planner_prepare_save_ical_markdown',
    {
      title: 'Preview Saving iCal Pro Projection',
      description: 'Preview regenerating the derived iCal Pro Markdown file from current canonical Planner/Vault facts. Arbitrary custom Markdown is not accepted.',
      inputSchema: z.object({ trip_id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ trip_id }) => writeService.preparePlannerSaveICalMarkdown(trip_id)),
  );

  server.registerTool(
    'ownly_prepare_create_object',
    {
      title: 'Preview Ownly Object Creation',
      description: 'Validate and preview a new physical object, recurring cost, or one-time experience. This does not write files; commit the returned operation_id separately.',
      inputSchema: z.object({
        object_type: z.enum(['physical', 'recurring_cost', 'one_time_experience']),
        title: z.string().min(1),
        amount: z.number().nonnegative(),
        currency: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        status: OBJECT_STATUS.optional(),
        body: z.string().optional(),
        purchased_at: z.string().optional(),
        ended_at: z.string().optional(),
        billing_cycle: z.enum(['weekly', 'monthly', 'quarterly', 'annual', 'custom']).optional(),
        billing_day: z.number().int().min(1).max(31).optional(),
        started_at: z.string().optional(),
        payment_account: z.string().min(1).optional(),
        annualized_cost: z.number().nonnegative().optional(),
        actual_total: z.number().nonnegative().optional(),
        experience_subtype: z.string().min(1).optional(),
        location: z.object({
          country: z.string().optional(),
          region: z.string().optional(),
          city: z.string().optional(),
          country_code: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        }).optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((args) => writeService.prepareCreateObject(args)),
  );

  server.registerTool(
    'ownly_prepare_update_object',
    {
      title: 'Preview Ownly Object Update',
      description: 'Preview validated changes to an existing Ownly object. The stable ID and object type cannot be changed.',
      inputSchema: z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        status: OBJECT_STATUS.optional(),
        category: z.string().min(1).optional(),
        amount: z.number().nonnegative().optional(),
        purchased_at: z.string().optional(),
        ended_at: z.string().nullable().optional(),
        billing_cycle: z.enum(['weekly', 'monthly', 'quarterly', 'annual', 'custom']).optional(),
        billing_day: z.number().int().min(1).max(31).optional(),
        started_at: z.string().optional(),
        payment_account: z.string().nullable().optional(),
        annualized_cost: z.number().nonnegative().optional(),
        actual_total: z.number().nonnegative().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((args) => writeService.prepareUpdateObject(args)),
  );

  server.registerTool(
    'ownly_prepare_retire_object',
    {
      title: 'Preview Retiring an Ownly Object',
      description: 'Preview moving a physical object to the idle lifecycle state with an end date.',
      inputSchema: z.object({ id: z.string().min(1), ended_at: z.string().optional() }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ id, ended_at }) => writeService.prepareRetireObject(id, ended_at)),
  );

  server.registerTool(
    'ownly_prepare_cancel_recurring_cost',
    {
      title: 'Preview Cancelling a Recurring Cost',
      description: 'Preview cancelling an Ownly recurring cost while preserving its history.',
      inputSchema: z.object({
        id: z.string().min(1),
        reason: z.string().min(1).optional(),
        cancelled_at: z.string().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ id, reason, cancelled_at }) =>
      writeService.prepareCancelRecurring(id, reason, cancelled_at)),
  );

  server.registerTool(
    'ownly_prepare_add_object_log',
    {
      title: 'Preview Adding an Ownly Object Log',
      description: 'Preview an append-only usage, issue, maintenance, regret, lesson, comparison, or exit note for an object.',
      inputSchema: z.object({
        id: z.string().min(1),
        event_type: z.enum(['usage', 'issue', 'maintenance', 'regret', 'lesson', 'comparison', 'exit_note']),
        summary: z.string().min(1),
        occurred_at: z.string().optional(),
        lesson: z.string().optional(),
        source: z.string().optional(),
        body: z.string().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((args) => writeService.prepareAddObjectLog(args)),
  );

  server.registerTool(
    'ownly_prepare_create_review',
    {
      title: 'Preview Creating an Ownly Review',
      description: 'Preview a review record. Object and exit reviews require a target object ID.',
      inputSchema: z.object({
        review_type: z.enum(['object_review', 'exit_record', 'monthly', 'annual']),
        summary: z.string().min(1),
        title: z.string().min(1).optional(),
        target_id: z.string().min(1).optional(),
        reviewed_at: z.string().optional(),
        regret_score: z.number().nullable().optional(),
        food_score: z.number().nullable().optional(),
        scenery_score: z.number().nullable().optional(),
        experience_score: z.number().nullable().optional(),
        body: z.string().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((args) => writeService.prepareCreateReview(args)),
  );

  server.registerTool(
    'ownly_prepare_create_snapshot',
    {
      title: 'Preview Creating an Ownly Snapshot',
      description: 'Preview a net-worth snapshot from total assets and liabilities.',
      inputSchema: z.object({
        assets: z.number(),
        liabilities: z.number().optional(),
        date: z.string().optional(),
        currency: z.string().min(1).optional(),
        is_month_end: z.boolean().optional(),
        body: z.string().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((args) => writeService.prepareCreateSnapshot(args)),
  );

  server.registerTool(
    'ownly_prepare_archive_object',
    {
      title: 'Preview Archiving an Ownly Object',
      description: 'Preview moving an active object file into Ownly Archive. The archive remains restorable.',
      inputSchema: z.object({ id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ id }) => writeService.prepareArchiveObject(id)),
  );

  server.registerTool(
    'ownly_prepare_restore_object',
    {
      title: 'Preview Restoring an Ownly Object',
      description: 'Preview restoring an archived Ownly object to the active Objects directory.',
      inputSchema: z.object({ id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ id }) => writeService.prepareRestoreObject(id)),
  );

  server.registerTool(
    'ownly_commit_operation',
    {
      title: 'Commit Prepared Ownly Operation',
      description: 'Persist one previously prepared operation after user confirmation. Creates a safety backup first and is idempotent for the operation ID.',
      inputSchema: z.object({ operation_id: z.string().uuid() }),
      annotations: COMMIT_WRITE_ANNOTATIONS,
    },
    safeHandler(async ({ operation_id }) => ({
      ...await writeService.commit(operation_id),
      health: getOwnlyDoctor(dataLocation),
    })),
  );

  server.registerTool(
    'ownly_discard_operation',
    {
      title: 'Discard Prepared Ownly Operation',
      description: 'Discard a prepared operation without changing the Ownly data files.',
      inputSchema: z.object({ operation_id: z.string().uuid() }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ operation_id }) => writeService.discard(operation_id)),
  );

  return server;
}

async function main() {
  let parsed;
  try {
    parsed = parseServerArgs(process.argv.slice(2), process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Ownly MCP configuration error: ${message}`);
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    printHelp();
    return;
  }

  let dataLocation;
  try {
    dataLocation = resolveOwnlyDataLocation(parsed.dataDir);
  } catch (error) {
    const payload = toOwnlyMcpErrorPayload(error);
    console.error(`Ownly MCP configuration error [${payload.code}]: ${payload.message}`);
    process.exitCode = 1;
    return;
  }

  console.error(`Ownly MCP running locally over stdio (${parsed.allowWrite ? 'two-phase writes enabled' : 'read-only'}).`);
  await serveStdio(() => createOwnlyMcpServer(dataLocation, { allowWrite: parsed.allowWrite }));
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entrypoint && import.meta.url === entrypoint) {
  void main().catch((error) => {
    const payload = toOwnlyMcpErrorPayload(error);
    console.error(`Ownly MCP failed [${payload.code}]: ${payload.message}`);
    process.exitCode = 1;
  });
}
