import * as process from 'process';
import { jest } from '@jest/globals';
import { TestAction, TestActionFactory } from '../../test/helpers/test-classes.js';
import { ModelType } from '../app.type.js';
import { TransactionService, TransactionServiceFactory } from '../services/transaction/transaction.service.js';
import { Action } from './action.decorator.js';
import { Container } from './container.js';
import { TestContainer } from './test-container.js';

describe('Action UT', () => {
  beforeEach(() => {
    Container.registerFactory(TestAction, TestActionFactory);
    Container.registerFactory(TransactionService, TransactionServiceFactory);

    TestContainer.create(
      {
        mocks: [
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

  it.skip('should throw error when cannot resolve TransactionService', () => {
    // Awaiting on https://github.com/quadnix/octo/issues/6
  });

  it('should register ModelType.MODEL', (done) => {
    Action(ModelType.MODEL)(TestAction);

    process.nextTick(async () => {
      const transactionService = await Container.get(TransactionService);
      expect(transactionService.registerModelActions).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('should register ModelType.OVERLAY', (done) => {
    Action(ModelType.OVERLAY)(TestAction);

    process.nextTick(async () => {
      const transactionService = await Container.get(TransactionService);
      expect(transactionService.registerOverlayActions).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('should register ModelType.RESOURCE', (done) => {
    Action(ModelType.RESOURCE)(TestAction);

    process.nextTick(async () => {
      const transactionService = await Container.get(TransactionService);
      expect(transactionService.registerResourceActions).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it.skip('should throw error when registering ModelType.OVERLAY', () => {
    // Awaiting on https://github.com/quadnix/octo/issues/6
  });
});
