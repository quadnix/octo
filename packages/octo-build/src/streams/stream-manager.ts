import chalk, { ChalkInstance } from 'chalk';
import { createWriteStream } from 'fs';
import { join, resolve } from 'path';
import { Readable } from 'stream';

export class StreamManager {
  private colors = {
    BLUE: chalk.blue,
    CYAN: chalk.cyan,
    GREEN: chalk.green,
    MAGENTA: chalk.magenta,
    YELLOW: chalk.yellow,
  };

  registerStream(jobName: string, stream: Readable, options: { logsPathPrefix?: string }): void {
    const colorKeys = Object.keys(this.colors);
    const randomColor: ChalkInstance = this.colors[colorKeys[(colorKeys.length * Math.random()) << 0]];

    stream.on('data', (data) => {
      console.log(randomColor(data.toString()));
    });
    stream.on('error', (error) => {
      console.log(chalk.red(error));
    });
    stream.on('exit', () => {
      stream.removeAllListeners();
    });

    if (options.logsPathPrefix) {
      const writeStream = createWriteStream(resolve(join(options.logsPathPrefix, `${jobName}.log`)), {
        flags: 'a',
      });
      stream.pipe(writeStream);
    }
  }
}
