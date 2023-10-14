import { HOOK_ACTION } from '../../models/hook.interface';
import { Model } from '../../models/model.abstract';
import { Region } from '../../models/region/region.model';
import { HookService } from './hook.service';

describe('HookService UT', () => {
  it('should not be able to apply the hook when not filtered', () => {
    const hookService = HookService.getInstance();

    const testHookMock = jest.fn();
    hookService.registerHooks([
      {
        filter: (): boolean => false,
        handle: testHookMock,
      },
    ]);

    hookService.notifyHooks(HOOK_ACTION.ADD, null as unknown as Model<unknown, unknown>);

    expect(testHookMock).toHaveBeenCalledTimes(0);
  });

  it('should be able to apply the hook when filtered', () => {
    const hookService = HookService.getInstance();
    const region = new Region('region-1');

    const testHookMock = jest.fn();
    hookService.registerHooks([
      {
        filter: (): boolean => true,
        handle: testHookMock,
      },
    ]);

    hookService.notifyHooks(HOOK_ACTION.ADD, region);

    expect(testHookMock).toHaveBeenCalledTimes(1);
    expect(testHookMock.mock.calls[0][0].regionId).toBe('region-1');
  });
});
