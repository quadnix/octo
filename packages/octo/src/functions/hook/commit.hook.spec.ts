import { jest } from '@jest/globals';
import { Octo } from '../../main.js';
import { App } from '../../models/app/app.model.js';
import { TestStateProvider } from '../../services/state-management/test.state-provider.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';
import { Container } from '../container/container.js';

describe('CommitHook UT', () => {
  beforeEach(async () => {
    const container = Container.getInstance();
    const transactionService = await container.get(TransactionService);

    jest.spyOn(transactionService, 'beginTransaction').mockImplementation(
      () =>
        ({
          next: (jest.fn() as jest.Mocked<any>).mockResolvedValue({ value: [[]] }),
        }) as any,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call post and pre commit hooks', async () => {
    const postCommitHookMock = jest.fn();
    const preCommitHookMock = jest.fn();

    const stateProvider = new TestStateProvider();
    const { lockId } = await stateProvider.lockApp();

    const octo = new Octo();
    await octo.initialize(stateProvider);

    octo.registerHooks({
      postCommitHooks: [{ handle: postCommitHookMock as any }],
      preCommitHooks: [{ handle: preCommitHookMock as any }],
    });
    const generator = octo.beginTransaction(new App('test-app'), { appLockId: lockId });
    await generator.next();

    expect(postCommitHookMock).toHaveBeenCalledTimes(1);
    expect(preCommitHookMock).toHaveBeenCalledTimes(1);
  });
});
