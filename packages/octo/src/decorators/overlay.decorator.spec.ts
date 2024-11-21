import { jest } from '@jest/globals';
import { TestModelWithoutUnsynth, TestOverlay } from '../../test/helpers/test-classes.js';
import { NodeType } from '../app.type.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { BaseOverlaySchema } from '../overlays/overlay.schema.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Overlay } from './overlay.decorator.js';

class TestOverlaySchema extends BaseOverlaySchema {}

describe('Overlay UT', () => {
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
            type: TestOverlay,
            value: new TestOverlay('overlayId', {}, []),
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
    TestOverlay['NODE_NAME'] = undefined;
    // @ts-expect-error static members are readonly.
    TestOverlay['NODE_PACKAGE'] = undefined;
    // @ts-expect-error static members are readonly.
    TestOverlay['NODE_SCHEMA'] = undefined;
    // @ts-expect-error static members are readonly.
    TestOverlay['NODE_TYPE'] = undefined;

    await TestContainer.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Overlay<TestOverlay>('$$', '$$', TestOverlaySchema)(TestOverlay);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when overlayName is invalid', () => {
    expect(() => {
      Overlay<TestOverlay>('@octo', '$$', TestOverlaySchema)(TestOverlay);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid overlay name: $$"`);
  });

  it('should throw error when overlay class does not extend AOverlay', () => {
    expect(() => {
      Overlay<TestOverlay>('@octo', 'test', TestOverlaySchema)(TestModelWithoutUnsynth);
    }).toThrowErrorMatchingInlineSnapshot(`"Class "TestModelWithoutUnsynth" must extend the AOverlay class!"`);
  });

  it('should set static members', async () => {
    expect(TestOverlay.NODE_NAME).toBeUndefined();
    expect(TestOverlay.NODE_PACKAGE).toBeUndefined();
    expect(TestOverlay.NODE_SCHEMA).toBeUndefined();
    expect(TestOverlay.NODE_TYPE).toBeUndefined();

    Overlay<TestOverlay>('@octo', 'test', TestOverlaySchema)(TestOverlay);

    expect(TestOverlay.NODE_NAME).toEqual('test');
    expect(TestOverlay.NODE_PACKAGE).toEqual('@octo');
    expect(TestOverlay.NODE_SCHEMA).toEqual(TestOverlaySchema);
    expect(TestOverlay.NODE_TYPE).toEqual(NodeType.OVERLAY);
  });

  it('should register an overlay', async () => {
    Overlay<TestOverlay>('@octo', 'test', TestOverlaySchema)(TestOverlay);

    await container.waitToResolveAllFactories();

    const modelSerializationService = await container.get(ModelSerializationService);
    expect(modelSerializationService.registerClass).toHaveBeenCalledTimes(1);
  });

  it('should throw error when registration fails', async () => {
    const modelSerializationService = await container.get(ModelSerializationService);
    jest.spyOn(modelSerializationService, 'registerClass').mockImplementation(() => {
      throw new Error('error');
    });

    Overlay<TestOverlay>('@octo', 'test', TestOverlaySchema)(TestOverlay);

    await expect(async () => {
      await container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"error"`);
  });
});
