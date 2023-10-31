import 'reflect-metadata';

import { unlink } from 'fs';
import { dirname, join } from 'path';
import { Container } from 'typedi';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { LocalStateProvider, LocalStateProviderContext } from './local.state-provider.js';
import { StateManagementService } from './state-management.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('LocalStateProvider UT', () => {
  let filePath: string;
  let localStateProvider: LocalStateProvider;

  beforeAll(() => {
    Container.set(LocalStateProviderContext, { localStateDirectoryPath: __dirname });
    localStateProvider = Container.get(LocalStateProvider);
  });

  afterEach(async () => {
    if (filePath) {
      await unlinkAsync(filePath);
    }
  });

  afterAll(() => {
    Container.reset();
  });

  it('should be able to save state', async () => {
    filePath = join(__dirname, 'manifest.json');

    const stateManagementService = StateManagementService.getInstance(localStateProvider);

    const data = Buffer.from(
      JSON.stringify({
        key1: 'value1',
        key2: 'value2',
      }),
    );
    await stateManagementService.saveState('manifest.json', data);

    const manifestData = await stateManagementService.getState('manifest.json');
    expect(JSON.parse(manifestData.toString())).toMatchInlineSnapshot(`
      {
        "key1": "value1",
        "key2": "value2",
      }
    `);
  });
});
