import { Environment } from '../../models/environment/environment.model';
import { HOOK_NAMES } from '../../models/hook.interface';
import { Region } from '../../models/region/region.model';
import { HookService } from './hook.service';

describe('HookService UT', () => {
  it('should not be able to apply the hook when not registered', () => {
    const hookService = HookService.getInstance();

    const testHookMock = jest.fn();
    hookService.registerHooks([
      {
        HOOK_NAME: HOOK_NAMES.ADD_PIPELINE,
        args: [],
        handle: testHookMock,
      },
    ]);

    hookService.applyHooks('doesNotExist' as HOOK_NAMES);

    expect(testHookMock).toHaveBeenCalledTimes(0);
  });

  it('should be able to apply the hook when registered', () => {
    const hookService = HookService.getInstance();
    const region = new Region('region-1');
    const environment = new Environment('qa');

    const test1HookMock = jest.fn();
    hookService.registerHooks([
      {
        HOOK_NAME: HOOK_NAMES.ADD_ENVIRONMENT,
        args: [region, environment],
        handle: test1HookMock,
      },
    ]);

    hookService.applyHooks(HOOK_NAMES.ADD_ENVIRONMENT);

    expect(test1HookMock).toHaveBeenCalledTimes(1);
    expect(test1HookMock.mock.calls[0][0].regionId).toBe('region-1');
    expect(test1HookMock.mock.calls[0][1].environmentName).toBe('qa');
  });
});
