import { unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { LocalStateProvider } from './local.state-provider';
import { StateManagementService } from './state-management.service';

const unlinkAsync = promisify(unlink);

describe('LocalStateProvider UT', () => {
  let filePath;

  afterEach(async () => {
    if (filePath) {
      await unlinkAsync(filePath);
    }
  });

  it('should be able to save application state', async () => {
    filePath = join(__dirname, 'infrastructure.json');

    const localStateProvider = new LocalStateProvider(__dirname);
    const stateManagementService = StateManagementService.getInstance(localStateProvider);

    await stateManagementService.saveApplicationState({
      dependencies: [],
      models: {},
      version: 'v1',
    });

    const applicationData = await stateManagementService.getApplicationState();
    expect(applicationData).toMatchInlineSnapshot(`
      {
        "dependencies": [],
        "models": {},
        "version": "v1",
      }
    `);
  });

  it('should be able to save buffer state', async () => {
    filePath = join(__dirname, 'manifest.json');

    const localStateProvider = new LocalStateProvider(__dirname);
    const stateManagementService = StateManagementService.getInstance(localStateProvider);

    const data = Buffer.from(
      JSON.stringify({
        key1: 'value1',
        key2: 'value2',
      }),
    );
    await stateManagementService.saveBufferState('manifest.json', data);

    const manifestData = await stateManagementService.getBufferState('manifest.json');
    expect(JSON.parse(manifestData.toString())).toMatchInlineSnapshot(`
      {
        "key1": "value1",
        "key2": "value2",
      }
    `);
  });
});
