import type { UnknownModule } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import { createResource, createTestResources } from '../../utilities/test-helpers/test-resources.js';
import { InputService } from './input.service.js';

describe('InputService UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('getRootModel()', () => {
    let inputService: InputService;

    beforeEach(async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      inputService = new InputService(overlayDataRepository, resourceDataRepository);
    });

    it('should throw when no app model is registered', () => {
      expect(() => {
        inputService.getRootModel();
      }).toThrow('No app model is registered!');
    });

    it('should return the app model, ignoring all other models', () => {
      const {
        account: [account1],
        app: [app1],
      } = create({ account: ['aws,account'], app: ['test-app'] });
      inputService.registerModel('testModule', app1);
      inputService.registerModel('testModule', account1);

      expect(inputService.getRootModel()).toBe(app1);
    });

    it('should return the app model when registered under multiple module ids', () => {
      const {
        app: [app1],
      } = create({ app: ['test-app'] });
      inputService.registerModel('module1', app1);
      inputService.registerModel('module2', app1);

      expect(inputService.getRootModel()).toBe(app1);
    });

    it('should throw when two distinct app models are registered', () => {
      const {
        app: [app1],
      } = create({ app: ['test-app'] });
      const {
        app: [app2],
      } = create({ app: ['test-app'] });
      inputService.registerModel('module1', app1);
      inputService.registerModel('module2', app2);

      expect(() => {
        inputService.getRootModel();
      }).toThrow('Multiple app models are registered: module1.model.app, module2.model.app!');
    });
  });

  describe('registerResource()', () => {
    let inputService: InputService;

    beforeEach(async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      inputService = new InputService(overlayDataRepository, resourceDataRepository);
    });

    it('should throw when a module creates two resources with one local resource id in two scopes', () => {
      const TestResource = createResource('test-resource');
      const resource1 = AResource.constructInScope(
        ['region=region-1,account=account,app=test'],
        () => new TestResource('sec-grp-web'),
      );
      const resource2 = AResource.constructInScope(
        ['region=region-2,account=account,app=test'],
        () => new TestResource('sec-grp-web'),
      );
      inputService.registerResource('webModule', resource1);

      expect(() => {
        inputService.registerResource('webModule', resource2);
      }).toThrow('Module "webModule" creates two resources named "sec-grp-web"!');
    });

    it('should register resources with one local resource id under two modules', () => {
      const TestResource = createResource('test-resource');
      const resource1 = AResource.constructInScope(
        ['region=region-1,account=account,app=test'],
        () => new TestResource('sec-grp-web'),
      );
      const resource2 = AResource.constructInScope(
        ['region=region-2,account=account,app=test'],
        () => new TestResource('sec-grp-web'),
      );

      inputService.registerResource('webModule1', resource1);
      inputService.registerResource('webModule2', resource2);

      expect(inputService.getModuleIdFromResource(resource2)).toBe('webModule2');
    });
  });

  describe('resolve()', () => {
    describe('when resolving inputs', () => {
      it('should resolve simple key', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('testModule', 'key1', 'value1');

        expect(inputService.resolve('testModule.input.key1')).toBe('value1');
      });

      it('should resolve referenced key', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('testModule', 'key1', 'value1');
        inputService.registerInput('testModule', 'key2', '${{testModule.input.key1}}');

        expect(inputService.resolve('testModule.input.key2')).toBe('value1');
      });

      it('should resolve key with nested reference', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('testModule', 'key1', 'value1');
        inputService.registerInput('testModule', 'key2', {
          key3: 'value4',
          key4: '${{testModule.input.key1}}',
          key5: ['${{testModule.input.key1}}'],
          key6: { key7: { key8: [{ key9: '${{testModule.input.key1}}' }] } },
        });

        expect(inputService.resolve('testModule.input.key2')).toEqual({
          key3: 'value4',
          key4: 'value1',
          key5: ['value1'],
          key6: { key7: { key8: [{ key9: 'value1' }] } },
        });
      });

      it('should substitute undefined if any reference is not resolved', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('testModule', 'key1', 'value1');
        inputService.registerInput('testModule', 'key2', {
          key3: 'value4',
          key4: '${{testModule.input.key1}}',
          key5: ['${{testModule.input.key1}}'],
          key6: { key7: { key8: [{ key9: '${{testModule.input.key0}}' }] } },
        });

        expect(inputService.resolve('testModule.input.key2')).toEqual({
          key3: 'value4',
          key4: 'value1',
          key5: ['value1'],
          key6: { key7: { key8: [{ key9: undefined }] } },
        });
      });

      it('should throw error if any reference results in recursion', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('testModule', 'key1', '${{testModule.input.key1}}');

        expect(() => {
          inputService.resolve('testModule.input.key1');
        }).toThrow('Input could not be resolved!');
      });

      it('should throw when an input refers to a model no module has created yet', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('subnetModule', 'region', '${{regionModule.model.region}}');

        expect(() => inputService.resolve('subnetModule.input.region')).toThrowErrorMatchingInlineSnapshot(
          `"Input "subnetModule.input.region" refers to "\${{regionModule.model.region}}", which does not exist! If a module creates it, order that module's type before this one's."`,
        );
      });

      it('should throw when a nested input refers to a model no module has created yet', async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        const inputService = new InputService(overlayDataRepository, resourceDataRepository);

        inputService.registerInput('subnetModule', 'localFilesystems', ['${{filesystemModule.model.filesystem}}']);

        expect(() => inputService.resolve('subnetModule.input.localFilesystems')).toThrowErrorMatchingInlineSnapshot(
          `"Input "subnetModule.input.localFilesystems" refers to "\${{filesystemModule.model.filesystem}}", which does not exist! If a module creates it, order that module's type before this one's."`,
        );
      });
    });

    describe('when resolving tags', () => {
      let inputService: InputService;

      beforeEach(async () => {
        const [overlayDataRepository, resourceDataRepository] = await Promise.all([
          container.get(OverlayDataRepository),
          container.get(ResourceDataRepository),
        ]);
        inputService = new InputService(overlayDataRepository, resourceDataRepository);
      });

      it('should resolve a non-template tag', async () => {
        const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
        ]);
        inputService.registerModule('testModule', {} as UnknownModule);
        inputService.registerResource('testModule', resource1);

        inputService.registerTag(true, { key1: 'value1' });
        inputService.registerTag({ moduleId: 'testModule' }, { key2: 'value2' });
        inputService.registerTag(
          { moduleId: 'testModule', resourceContext: '@octo/test-resource=resource-1' },
          { key3: 'value3' },
        );

        expect(inputService.resolve('testModule.tag.@octo/test-resource=resource-1')).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
        });
      });

      it('should resolve a template tag', async () => {
        const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
        ]);
        inputService.registerModule('testModule', {} as UnknownModule);
        inputService.registerResource('testModule', resource1);
        inputService.registerInput('testModule', 'name', 'test');

        inputService.registerTag(true, { key1: 'value1' });
        inputService.registerTag({ moduleId: 'testModule' }, { key2: 'value2' });
        inputService.registerTag(
          { moduleId: 'testModule', resourceContext: '@octo/test-resource=resource-1' },
          { key3: '${{testModule.input.name}}' },
        );

        expect(inputService.resolve('testModule.tag.@octo/test-resource=resource-1')).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: 'test',
        });
      });
    });
  });
});
