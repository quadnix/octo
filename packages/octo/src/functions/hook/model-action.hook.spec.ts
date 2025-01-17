import { jest } from '@jest/globals';
import type { UnknownModule } from '../../app.type.js';
import { Action } from '../../decorators/action.decorator.js';
import { App } from '../../models/app/app.model.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import { TestModuleContainer } from '../../modules/test-module.container.js';
import { TestStateProvider } from '../../services/state-management/test.state-provider.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';
import { TestAppModule } from '../../utilities/test-helpers/test-classes.js';
import { TestContainer } from '../container/test-container.js';
import { DiffMetadata } from '../diff/diff-metadata.js';
import { Diff, DiffAction } from '../diff/diff.js';

describe('ModelActionHook UT', () => {
  const universalModelAction: IModelAction<UnknownModule> = {
    constructor: { name: 'UniversalModelAction' },
    filter: () => true,
    handle: (jest.fn() as jest.Mocked<any>).mockResolvedValue({}),
    name: 'UniversalModelAction',
  } as any;

  let applyModels: TransactionService['applyModels'];
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      {
        mocks: [
          {
            type: 'UniversalModelAction',
            value: universalModelAction,
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );

    Action(App)(universalModelAction);

    const service = await container.get(TransactionService);
    applyModels = service['applyModels'];
    applyModels = applyModels.bind(service);

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    jest.resetAllMocks();
  });

  it('should call post and pre model-action hooks', async () => {
    const postModelActionHookMock = (jest.fn() as jest.Mocked<any>).mockResolvedValue({});
    const preModelActionHookMock = (jest.fn() as jest.Mocked<any>).mockResolvedValue({});

    testModuleContainer.octo.registerHooks({
      postModelActionHooks: [{ action: universalModelAction, handle: postModelActionHookMock as any }],
      preModelActionHooks: [{ action: universalModelAction, handle: preModelActionHookMock as any }],
    });
    const { moduleId: app } = await testModuleContainer.runModule<TestAppModule>({
      inputs: { name: 'app' },
      moduleId: 'moduleId',
      type: TestAppModule,
    });

    const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
    const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
    diffMetadata.applyOrder = 0;

    await applyModels([diffMetadata]);

    expect(postModelActionHookMock).toHaveBeenCalledTimes(1);
    expect(preModelActionHookMock).toHaveBeenCalledTimes(1);
  });
});
