import { writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { IApp } from '../../models/app/app.interface';
import { App } from '../../models/app/app.model';

const writeFileAsync = promisify(writeFile);

const SYNTH_FILE_NAME = 'infrastructure.json';
const SYNTH_VERSION = 'v0';

export class SynthService {
  readonly app: App;

  readonly version = SYNTH_VERSION;

  constructor(app: App) {
    this.app = app;
  }

  synth(): IApp & { version: string } {
    return { ...this.app.synth(), version: this.version };
  }

  async synthWrite(filePath: string): Promise<void> {
    const output = this.synth();
    await writeFileAsync(join(filePath, SYNTH_FILE_NAME), JSON.stringify(output, null, 2));
  }
}
