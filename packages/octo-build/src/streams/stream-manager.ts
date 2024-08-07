import chalk, { type ChalkInstance } from 'chalk';
import { type ChildProcessWithoutNullStreams } from 'child_process';
import { createWriteStream } from 'fs';
import { join, resolve } from 'path';

export class StreamManager {
  private colors = {
    BLUE: chalk.blue,
    CYAN: chalk.cyan,
    GREEN: chalk.green,
    MAGENTA: chalk.magenta,
    YELLOW: chalk.yellow,
  };

  registerStream(jobName: string, stream: ChildProcessWithoutNullStreams, options: { logsPathPrefix?: string }): void {
    const colorKeys = Object.keys(this.colors);
    const randomColor: ChalkInstance = this.colors[colorKeys[(colorKeys.length * Math.random()) << 0]];

    stream.stdout.on('data', (data) => {
      console.log(randomColor(data.toString()));
    });
    stream.stderr.on('error', (error) => {
      console.log(chalk.red(error));
    });
    stream.on('close', () => {
      stream.removeAllListeners();
    });

    if (options.logsPathPrefix) {
      const writeStream = createWriteStream(resolve(join(options.logsPathPrefix, `${jobName}.log`)), {
        flags: 'w',
      });
      stream.stdout.pipe(writeStream);
      stream.stderr.pipe(writeStream);
    }
  }
}
