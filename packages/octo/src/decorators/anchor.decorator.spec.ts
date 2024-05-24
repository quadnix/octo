import * as process from 'process';
import { jest } from '@jest/globals';
import { TestAnchor, TestAnchorFactory } from '../../test/helpers/test-classes.js';
import {
  ModelSerializationService,
  ModelSerializationServiceFactory,
} from '../services/serialization/model/model-serialization.service.js';
import { Anchor } from './anchor.decorator.js';
import { Container } from './container.js';
import { TestContainer } from './test-container.js';

describe('Anchor UT', () => {
  beforeEach(() => {
    Container.registerFactory(ModelSerializationService, ModelSerializationServiceFactory);
    Container.registerFactory(TestAnchor, TestAnchorFactory);

    TestContainer.create(
      {
        mocks: [
          {
            type: ModelSerializationService,
            value: {
              registerClass: jest.fn(),
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

  it.skip('should throw error when cannot resolve ModelSerializationService', () => {
    // Awaiting on https://github.com/quadnix/octo/issues/6
  });

  it('should register an anchor', (done) => {
    Anchor()(TestAnchor);

    process.nextTick(async () => {
      const modelSerializationService = await Container.get(ModelSerializationService);
      expect(modelSerializationService.registerClass).toHaveBeenCalledTimes(1);
      done();
    });
  });
});
