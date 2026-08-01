import { asCliError, getDataLocation, hasFlag, parseArgs } from './args';
import {
  doctorCommand,
  objectCommand,
  recurringCommand,
  reviewCommand,
  snapshotCommand,
  summaryCommand,
  type CommandContext,
} from './commands';
import { CliError, processCliIo, type CliIo } from './types';

export const CLI_HELP = `Ownly CLI

Usage:
  npm run wyqd -- --vault <path> object list [--json] [--status idle]
  npm run wyqd -- --vault <path> object get --id <id> [--json]
  npm run wyqd -- --vault <path> object search --query <text> [--json]
  npm run wyqd -- --vault <path> object review-needed [--json]
  npm run wyqd -- --vault <path> object history --id <id> [--json]
  npm run wyqd -- --vault <path> object due [--days 30] [--json]
  npm run wyqd -- --vault <path> object accounts [--json]
  npm run wyqd -- --vault <path> object add --title <name> --amount <num> [--object-type physical] [--json]
  npm run wyqd -- --vault <path> object update --id <id> [options] [--json]
  npm run wyqd -- --vault <path> object retire --id <id> [--json]
  npm run wyqd -- --vault <path> object cancel --id <id> [--json]
  npm run wyqd -- --vault <path> object delete --id <id> --yes [--json]
  npm run wyqd -- --vault <path> object restore --id <id> [--json]
  npm run wyqd -- --vault <path> object link --object-id <id> --review-id <id> [--force]
  npm run wyqd -- --vault <path> object batch-review-needed --json
  npm run wyqd -- --vault <path> object log add --id <object-id> --type <event-type> --summary <text> [--json]
  npm run wyqd -- --vault <path> object log list --id <object-id> [--json]
  npm run wyqd -- --vault <path> snapshot list|get|add|update|delete|restore [options]
  npm run wyqd -- --vault <path> review list|get|add|update|delete|restore [options]
  npm run wyqd -- --vault <path> recurring list [--active] [--json]
  npm run wyqd -- --vault <path> summary [--json]
  npm run wyqd -- --vault <path> doctor [--json]

Environment:
  OWNLY_VAULT can be used instead of --vault. The compatibility name may point
  to an Obsidian Vault or another local location containing the Ownly data folder.
`;

export interface RunCliOptions {
  env?: NodeJS.ProcessEnv;
  io?: CliIo;
  now?: Date;
}

export function runCli(argv: readonly string[], runOptions: RunCliOptions = {}): number {
  const env = runOptions.env ?? process.env;
  const io = runOptions.io ?? processCliIo;
  const now = runOptions.now ?? new Date();
  let jsonOutput = false;

  try {
    const { options, positionals } = parseArgs(argv);
    jsonOutput = hasFlag(options, 'json');
    if (hasFlag(options, 'help') || positionals.length === 0) {
      io.stdout(CLI_HELP);
      return 0;
    }

    const [resource, command = 'list', subCommand] = positionals;
    const context: CommandContext = {
      dataLocation: getDataLocation(options, env),
      options,
      io,
      now,
    };

    if (resource === 'doctor') doctorCommand(context);
    else if (resource === 'summary') summaryCommand(context);
    else if (resource === 'object') objectCommand(context, command, subCommand);
    else if (resource === 'snapshot') snapshotCommand(context, command);
    else if (resource === 'review') reviewCommand(context, command);
    else if (resource === 'recurring') recurringCommand(context, command);
    else throw new CliError(`Unknown resource: ${resource}`);
    return 0;
  } catch (error) {
    const cliError = asCliError(error);
    if (jsonOutput) {
      io.stderr(JSON.stringify({ error: cliError.message, code: cliError.code }));
    } else io.stderr(cliError.message);
    return cliError.exitCode;
  }
}
