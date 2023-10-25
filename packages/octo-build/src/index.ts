#!/usr/bin/env node

import chalk from 'chalk';
import { accessSync, constants, existsSync, readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join, resolve, sep } from 'path';
import * as process from 'process';
import yargs from 'yargs/yargs';
import { start } from './main.js';
import { IRunArguments } from './models/run-arguments.interface.js';
import { BuildFileParser } from './parsers/build-file.parser.js';

const PROGRAM_NAME = 'octob';
const USAGE =
  'Usage: $0 ' +
  '-b build.yml -s ~/path/to/my_project ' +
  '[--concurrency 5]' +
  '[--dryRun]' +
  '[--logsDir /new/path]' +
  '[--timeout 10000]';

const parser = yargs(process.argv.slice(2))
  .scriptName(PROGRAM_NAME)
  .options({
    b: {
      alias: 'buildFilePath',
      demandOption: true,
      description: 'The path to build file from sourcePath',
      type: 'string',
    },
    s: { alias: 'sourcePath', demandOption: true, description: 'The path to source of project', type: 'string' },
  })
  .option('concurrency', {
    default: 5,
    description: 'The number of concurrent jobs to run. Defaults to 5',
    type: 'number',
  })
  .option('dryRun', {
    default: false,
    description: 'Runs the program without actually executing any of the jobs. Defaults to FALSE',
    type: 'boolean',
  })
  .option('logsDir', {
    default: 'false',
    description: 'Enables writing logs to files in the directory specified. Defaults to no write',
    type: 'string',
  })
  .option('timeout', {
    default: 0,
    description: 'Defines the maximum amount of time (in minutes) this program can run. Defaults to INFINITE (0)',
    type: 'number',
  })
  .usage(chalk.green(USAGE));

const argv = await parser.argv;
let { b: buildFilePath, s: sourcePath } = argv;

// Resolve file paths.
if (sourcePath.endsWith(sep)) {
  sourcePath = sourcePath.substring(0, sourcePath.length - 1);
}
sourcePath = resolve(sourcePath);
if (buildFilePath.startsWith(sep)) {
  buildFilePath = buildFilePath.substring(1);
}
buildFilePath = resolve(join(sourcePath, buildFilePath));
const logsDir = !argv.logsDir || argv.logsDir.toLowerCase() === 'false' ? undefined : resolve(argv.logsDir);

// Ensure build file exists.
if (!existsSync(buildFilePath)) {
  console.log(chalk.red('Cannot find build file: ' + buildFilePath));
  process.exit(1);
}
// Ensure logsDir exists, and is writable.
try {
  if (logsDir) {
    accessSync(logsDir, constants.W_OK);
  }
} catch (error) {
  console.log(chalk.red("Logs directory doesn't exist, or is not writable: " + logsDir));
  process.exit(1);
}

// Prepare args.
const args: IRunArguments = {
  buildFilePath,
  concurrency: argv.concurrency,
  dryRun: argv.dryRun,
  logsDir,
  sourcePath,
  timeout: argv.timeout,
};

// Ensure build file can be loaded, and parsed.
let json;
try {
  json = load(readFileSync(buildFilePath, 'utf-8'));
} catch (error) {
  console.log(chalk.red('Unable to parse build file: ' + error.message));
  throw error;
}
const buildConfiguration = BuildFileParser.parse(json);

try {
  await start(args, buildConfiguration);
  console.log(chalk.green('Success'));
} catch (error) {
  console.log(chalk.red(error));
}
