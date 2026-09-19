import { StateManagementService } from './state-management.service.js';
import { TestStateProvider } from './test.state-provider.js';

describe('StateManagementService UT', () => {
  let service: StateManagementService;
  let stateProvider: TestStateProvider;

  beforeEach(() => {
    stateProvider = new TestStateProvider();
    service = new StateManagementService(stateProvider);
  });

  describe('getResourceResponse()', () => {
    // The committed graph as `commit` writes it, holding one resource with a response.
    async function commitResourceState(resourceId: string, response: Record<string, string>): Promise<void> {
      await service.saveResourceState(
        service.actualResourceStateFileName,
        {
          dependencies: [],
          resources: {
            [`ExternalIgwResource=${resourceId}`]: {
              className: '@octo/ExternalIgwResource',
              resource: { parents: [], properties: {}, resourceId, response, tags: {} },
            },
          },
        },
        { version: 1 },
      );
    }

    it('should return undefined when neither a published record nor a committed graph holds it', async () => {
      await expect(service.getResourceResponse('igw-1')).resolves.toBeUndefined();
    });

    it('should return undefined when the committed graph holds no such resource', async () => {
      await commitResourceState('igw-2', { igwId: 'igw-0other' });

      await expect(service.getResourceResponse('igw-1')).resolves.toBeUndefined();
    });

    it('should return what the last commit recorded', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0committed' });
    });

    it('should coerce a committed response value to a string', async () => {
      await commitResourceState('igw-1', { port: 80 } as unknown as Record<string, string>);

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ port: '80' });
    });

    // Between an action publishing and the commit that records it, the published record is the only
    // copy of the response, and it is newer than anything the committed graph holds.
    it('should prefer a published record over the committed graph', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });
      await service.saveExternalResourceState('igw-1', {
        inputs: {},
        properties: {},
        response: { igwId: 'igw-0published' },
      });

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0published' });
    });

    it('should hold the record of a resource whose id is not a legal file name', async () => {
      await service.saveExternalResourceState('image-tag-family/image-0-0-1', {
        inputs: {},
        properties: {},
        response: { digest: 'sha256:ab1' },
      });

      await expect(service.getResourceResponse('image-tag-family/image-0-0-1')).resolves.toEqual({
        digest: 'sha256:ab1',
      });
    });

    it('should fall back to the committed graph once the published record is cleared', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });
      await service.saveExternalResourceState('igw-1', {
        inputs: {},
        properties: {},
        response: { igwId: 'igw-0published' },
      });
      await service.deleteExternalResourceState('igw-1');

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0committed' });
    });
  });

  describe('listExternalResourceStateIds()', () => {
    it('should return nothing when no action has recorded anything', async () => {
      await expect(service.listExternalResourceStateIds()).resolves.toEqual([]);
    });

    it('should return the resource id of every record', async () => {
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });
      await service.saveExternalResourceState('igw-2', { inputs: {}, properties: {}, response: {} });

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['igw-1', 'igw-2']);
    });

    // The record of a resource whose id is not a legal file name is stored under an encoded name.
    it('should return a resource id the file name encoded', async () => {
      await service.saveExternalResourceState('image-tag-family/image-0-0-1', {
        inputs: {},
        properties: {},
        response: {},
      });

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['image-tag-family/image-0-0-1']);
    });

    // The name itself is a contract: a state provider that keeps state somewhere other than a
    // directory hands it to a filesystem, an object store and a URL path segment in turn, and only a
    // plain name survives all three.
    it('should store a record under a name that needs no escaping', async () => {
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });
      await service.saveExternalResourceState('image-tag-family/image-0-0-1', {
        inputs: {},
        properties: {},
        response: {},
      });

      await expect(stateProvider.listStates('resource-state-')).resolves.toEqual([
        'resource-state-igw-1.json',
        'resource-state-image-tag-family.image-0-0-1.json',
      ]);
    });

    it('should not return a record a commit cleared', async () => {
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });
      await service.saveExternalResourceState('igw-2', { inputs: {}, properties: {}, response: {} });
      await service.deleteExternalResourceState('igw-1');

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['igw-2']);
    });

    // The records sit beside the graph state files, which are not records of anything published.
    it('should not return the graph state files', async () => {
      await service.saveResourceState(service.actualResourceStateFileName, { dependencies: [], resources: {} }, {});
      await service.saveModelState(
        service.modelStateFileName,
        { anchors: [], dependencies: [], models: {}, overlays: [] },
        {},
      );
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['igw-1']);
    });
  });
});
