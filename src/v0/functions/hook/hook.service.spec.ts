import { Environment } from '../../models/environment/environment.model';
import { Region } from '../../models/region/region.model';
import { HookService } from './hook.service';

describe('HookService UT', () => {
  it('should be able to apply the hook when not registered', () => {
    const hookService = HookService.getInstance();

    const test1HookMock = jest.fn();
    hookService.registerHooks([
      {
        HOOK_NAME: 'test1',
        args: [],
        handle: test1HookMock,
      },
    ]);

    hookService.applyHooks('doesNotExist');

    expect(test1HookMock).toHaveBeenCalledTimes(0);
  });

  it('should be able to apply the hook when registered', () => {
    const hookService = HookService.getInstance();
    const region = new Region('region-1');
    const environment = new Environment('qa');

    const test1HookMock = jest.fn();
    hookService.registerHooks([
      {
        HOOK_NAME: 'test1',
        args: [region, environment],
        handle: test1HookMock,
      },
    ]);

    hookService.applyHooks('test1');

    expect(test1HookMock).toHaveBeenCalledTimes(1);
    expect(test1HookMock.mock.calls[0][0].regionId).toBe('region-1');
    expect(test1HookMock.mock.calls[0][1].environmentName).toBe('qa');
  });
});
