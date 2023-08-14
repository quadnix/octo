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

  it('should be able to save state', async () => {
    filePath = join(__dirname, 'manifest.json');

    const localStateProvider = new LocalStateProvider(__dirname);
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
