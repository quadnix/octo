#!/usr/bin/env node

import * as process from 'process';
import chalk from 'chalk';
import yargs from 'yargs/yargs';
import { buildCommand } from './commands/build/index.js';
import { createAppCommand } from './commands/create-app/index.js';
import { createCdkCommand } from './commands/create-cdk/index.js';
import { createModelCommand } from './commands/create-model/index.js';
import { createModuleCommand } from './commands/create-module/index.js';

const PROGRAM_NAME = 'octo';

const parser = yargs(process.argv.slice(2))
  .scriptName(PROGRAM_NAME)
  .usage(chalk.green('Usage: $0 <command> [options]'))
  .demandCommand(1, 'Please specify a command.')
  .help()
  .alias('h', 'help')
  .version()
  .alias('v', 'version');

parser.command(createAppCommand);
parser.command(createCdkCommand);
parser.command(createModelCommand);
parser.command(createModuleCommand);
parser.command(buildCommand);

await parser.argv;
