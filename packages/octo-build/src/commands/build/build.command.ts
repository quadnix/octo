import { accessSync, constants, existsSync, readFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import chalk from 'chalk';
import { load } from 'js-yaml';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { Main } from './main.js';
import type { IRunArguments } from './models/run-arguments.interface.js';
import { BuildFileParser } from './parsers/build-file.parser.js';

export const buildCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('buildFilePath', {
        alias: 'b',
        default: 'build.yml',
        description: 'The path to build file relative to sourcePath.',
        type: 'string',
      })
      .option('sourcePath', {
        alias: 's',
        default: '.',
        description: 'The path to the source of the project',
        type: 'string',
      })
      .option('concurrency', {
        alias: 'c',
        default: 5,
        description: 'The number of concurrent jobs to run.',
        type: 'number',
      })
      .option('dryRun', {
        default: false,
        description: 'Runs the program without actually executing any of the jobs.',
        type: 'boolean',
      })
      .option('logsDir', {
        default: 'false',
        description: 'Enables writing logs to files in the specified directory.',
        type: 'string',
      })
      .option('timeout', {
        default: 0,
        description: 'Defines the maximum amount of time (in minutes) this program can run.',
        type: 'number',
      });
  },
  command: 'build',
  describe: 'Build a project using Octo build steps.',
  handler: async (
    argv: ArgumentsCamelCase<{
      buildFilePath: string;
      sourcePath: string;
      concurrency: number;
      dryRun: boolean;
      logsDir: string;
      timeout: number;
    }>,
  ): Promise<void> => {
    let { buildFilePath, sourcePath } = argv;
    let logsDir: string | undefined = argv.logsDir;
    const { concurrency, dryRun, timeout } = argv;

    // Resolve file paths.
    if (sourcePath.endsWith(sep)) {
      sourcePath = sourcePath.substring(0, sourcePath.length - 1);
    }
    sourcePath = resolve(sourcePath);
    if (buildFilePath.startsWith(sep)) {
      buildFilePath = buildFilePath.substring(1);
    }
    buildFilePath = resolve(join(sourcePath, buildFilePath));
    logsDir = !logsDir || logsDir.toLowerCase() === 'false' ? undefined : resolve(logsDir);

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
      concurrency,
      dryRun,
      logsDir,
      sourcePath,
      timeout,
    };

    // Ensure build file can be loaded, and parsed.
    let json: unknown;
    try {
      json = load(readFileSync(buildFilePath, 'utf-8'));
    } catch (error) {
      console.log(chalk.red('Unable to parse build file: ' + error.message));
      throw error;
    }
    const buildConfiguration = BuildFileParser.parse(json);

    try {
      const main = new Main(args, buildConfiguration);
      await main.start();
      console.log(chalk.green('Success'));
    } catch (error) {
      console.log(chalk.red(error));
    }
  },
};
