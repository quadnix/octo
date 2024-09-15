import { jest } from '@jest/globals';
import { TestModelWithoutUnsynth, TestOverlay } from '../../test/helpers/test-classes.js';
import { NodeType } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Model } from './model.decorator.js';

describe('Model UT', () => {
  beforeEach(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: ModelSerializationService,
            value: {
              registerClass: jest.fn(),
            },
          },
          {
            type: TestModelWithoutUnsynth,
            value: new TestModelWithoutUnsynth(),
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(() => {
    // @ts-expect-error static members are readonly.
    TestModelWithoutUnsynth['NODE_NAME'] = undefined;
    // @ts-expect-error static members are readonly.
    TestModelWithoutUnsynth['NODE_PACKAGE'] = undefined;
    // @ts-expect-error static members are readonly.
    TestModelWithoutUnsynth['NODE_TYPE'] = undefined;

    Container.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Model('$$', '$$')(TestModelWithoutUnsynth);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when modelName is invalid', () => {
    expect(() => {
      Model('@octo', '$$')(TestModelWithoutUnsynth);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid model name: $$"`);
  });

  it('should throw error when model class does not extend AModel', () => {
    expect(() => {
      Model('@octo', 'test')(TestOverlay);
    }).toThrowErrorMatchingInlineSnapshot(`"Class "TestOverlay" must extend the AModel class!"`);
  });

  it('should set static members', async () => {
    expect(TestModelWithoutUnsynth.NODE_NAME).toBeUndefined();
    expect(TestModelWithoutUnsynth.NODE_PACKAGE).toBeUndefined();
    expect(TestModelWithoutUnsynth.NODE_TYPE).toBeUndefined();

    Model('@octo', 'test')(TestModelWithoutUnsynth);

    expect(TestModelWithoutUnsynth.NODE_NAME).toEqual('test');
    expect(TestModelWithoutUnsynth.NODE_PACKAGE).toEqual('@octo');
    expect(TestModelWithoutUnsynth.NODE_TYPE).toEqual(NodeType.MODEL);
  });

  it('should register a model', async () => {
    Model('@octo', 'test')(TestModelWithoutUnsynth);

    await Container.waitToResolveAllFactories();

    const modelSerializationService = await Container.get(ModelSerializationService);
    expect(modelSerializationService.registerClass).toHaveBeenCalledTimes(1);
  });

  it('should throw error when registration fails', async () => {
    const modelSerializationService = await Container.get(ModelSerializationService);
    jest.spyOn(modelSerializationService, 'registerClass').mockImplementation(() => {
      throw new Error('error');
    });

    Model('@octo', 'test')(TestModelWithoutUnsynth);

    await expect(async () => {
      await Container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"error"`);
  });
});
