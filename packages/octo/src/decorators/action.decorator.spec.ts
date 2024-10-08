import { jest } from '@jest/globals';
import { TestAction, TestModelWithoutUnsynth, TestOverlay, TestResource } from '../../test/helpers/test-classes.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Action } from './action.decorator.js';
import { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';

describe('Action UT', () => {
  beforeEach(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: TestAction,
            value: new TestAction(),
          },
          {
            type: TransactionService,
            value: {
              registerModelActions: jest.fn(),
              registerOverlayActions: jest.fn(),
              registerResourceActions: jest.fn(),
            },
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(() => {
    Container.reset();
  });

  it('should throw error when constructor is not a recognized node', async () => {
    class Test {}

    Action(Test as any)(TestAction);

    await expect(async () => {
      await Container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Class "Test" is not recognized in @Action decorator!"`);
  });

  it('should register an action for model', async () => {
    Action(TestModelWithoutUnsynth)(TestAction);

    await Container.waitToResolveAllFactories();

    const transactionService = await Container.get(TransactionService);
    expect(transactionService.registerModelActions).toHaveBeenCalledTimes(1);
  });

  it('should register an action for overlay', async () => {
    Action(TestOverlay)(TestAction);

    await Container.waitToResolveAllFactories();

    const transactionService = await Container.get(TransactionService);
    expect(transactionService.registerOverlayActions).toHaveBeenCalledTimes(1);
  });

  it('should register ModelType.RESOURCE', async () => {
    Action(TestResource)(TestAction);

    await Container.waitToResolveAllFactories();

    const transactionService = await Container.get(TransactionService);
    expect(transactionService.registerResourceActions).toHaveBeenCalledTimes(1);
  });

  it('should throw error when registration fails', async () => {
    const transactionService = await Container.get(TransactionService);
    jest.spyOn(transactionService, 'registerModelActions').mockImplementation(() => {
      throw new Error('error');
    });

    Action(TestModelWithoutUnsynth)(TestAction);

    await expect(async () => {
      await Container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"error"`);
  });
});
