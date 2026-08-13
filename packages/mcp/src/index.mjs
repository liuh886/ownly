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

const SERVER_NAME = 'ownly';
const SERVER_VERSION = '0.1.0';
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
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
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      help = true;
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

  return { dataDir, help };
}

function printHelp() {
  process.stdout.write(`Ownly MCP\n\nUsage:\n  ownly-mcp --data-dir <path-containing-Ownly>\n\nEnvironment:\n  OWNLY_DATA_DIR=<path-containing-Ownly>\n\nOwnly MCP is read-only. The configured path must contain an Ownly/ data folder.\n`);
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

export function createOwnlyMcpServer(dataLocation) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Ownly is a read-only local evidence source. Use Doctor before high-stakes analysis when data quality matters. Treat tool results as recorded facts and keep recommendations or interpretations clearly separate from those facts. Do not claim that all Ownly data stays outside the model context: only the source-of-truth remains local; returned tool results are shared with this MCP client.',
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

  console.error('Ownly MCP running locally over stdio (read-only).');
  await serveStdio(() => createOwnlyMcpServer(dataLocation));
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entrypoint && import.meta.url === entrypoint) {
  void main().catch((error) => {
    const payload = toOwnlyMcpErrorPayload(error);
    console.error(`Ownly MCP failed [${payload.code}]: ${payload.message}`);
    process.exitCode = 1;
  });
}
