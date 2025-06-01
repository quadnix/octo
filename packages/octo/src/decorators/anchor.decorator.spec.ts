import { jest } from '@jest/globals';
import type { UnknownModel } from '../app.type.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { TestAnchor, TestModelWithoutUnsynth } from '../utilities/test-helpers/test-classes.js';
import { Anchor } from './anchor.decorator.js';

describe('Anchor UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            type: ModelSerializationService,
            value: {
              registerClass: jest.fn(),
            },
          },
          {
            type: TestAnchor,
            value: new TestAnchor('anchorId', {}, {} as UnknownModel),
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(async () => {
    // @ts-expect-error static members are readonly.
    TestAnchor['NODE_PACKAGE'] = undefined;

    await TestContainer.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Anchor('$$')(TestAnchor);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when anchor class does not extend AAnchor', () => {
    expect(() => {
      Anchor('@octo')(TestModelWithoutUnsynth);
    }).toThrowErrorMatchingInlineSnapshot(`"Class "TestModelWithoutUnsynth" must extend the AAnchor class!"`);
  });

  it('should set static members', async () => {
    expect(TestAnchor.NODE_PACKAGE).toBeUndefined();

    Anchor('@octo')(TestAnchor);

    expect(TestAnchor.NODE_PACKAGE).toEqual('@octo');
  });

  it('should register an anchor', async () => {
    Anchor('@octo')(TestAnchor);

    await container.waitToResolveAllFactories();

    const modelSerializationService = await container.get(ModelSerializationService);
    expect(modelSerializationService.registerClass).toHaveBeenCalledTimes(1);
  });

  it('should throw error when registration fails', async () => {
    const modelSerializationService = await container.get(ModelSerializationService);
    jest.spyOn(modelSerializationService, 'registerClass').mockImplementation(() => {
      throw new Error('error');
    });

    Anchor('@octo')(TestAnchor);

    await expect(async () => {
      await container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"error"`);
  });
});
