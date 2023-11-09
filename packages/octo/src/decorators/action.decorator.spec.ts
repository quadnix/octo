import { jest } from '@jest/globals';
import { ModelType } from '../app.type.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Action } from './action.decorator.js';
import { Container } from './container.js';
import { Factory } from './factory.decorator.js';

@Factory<TransactionService>(TransactionService, { metadata: { test: 'true ' } })
class TestTransactionServiceFactory {
  static instance = {
    registerModelActions: jest.fn(),
  } as unknown as TransactionService;

  static async create(): Promise<TransactionService> {
    return this.instance;
  }
}

@Action(ModelType.MODEL)
class TestAction {}

@Factory<TestAction>(TestAction)
class TestActionFactory {
  static async create(): Promise<TestAction> {
    return new TestAction();
  }
}

describe('Action UT', () => {
  beforeAll(() => {
    Container.setDefault(TransactionService, TestTransactionServiceFactory);
    Container.setDefault(TestAction, TestActionFactory);
  });

  afterAll(() => {
    Container.reset();
  });

  it('should register action', () => {
    const registerModelActionsMock = jest.spyOn(TestTransactionServiceFactory.instance, 'registerModelActions');
    expect(registerModelActionsMock).toHaveBeenCalledTimes(1);
  });
});
