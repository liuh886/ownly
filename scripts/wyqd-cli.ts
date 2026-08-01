#!/usr/bin/env node

import { runCli } from './cli/run';

process.exitCode = runCli(process.argv.slice(2));
