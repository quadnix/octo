import { jest } from '@jest/globals';
import { ModelType } from '../app.type.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Action } from './action.decorator.js';
import { Container } from './container.js';
import { Factory } from './factory.decorator.js';

@Action(ModelType.MODEL)
class TestAction {}

@Factory<TransactionService>(TransactionService)
class TestTransactionServiceFactory {
  static instance: TransactionService = jest.fn() as unknown as TransactionService;

  static async create(): Promise<TransactionService> {
    return this.instance;
  }
}

describe('Action UT', () => {
  beforeAll(() => {
    Container.registerFactory(TransactionService, TestTransactionServiceFactory, { metadata: { test: 'true ' } });
    Container.setDefault(TransactionService, TestTransactionServiceFactory);
  });

  afterAll(() => {
    Container.reset();
  });

  it('should register action', () => {
    expect(TestTransactionServiceFactory.instance).toHaveBeenCalled();
  });
});
