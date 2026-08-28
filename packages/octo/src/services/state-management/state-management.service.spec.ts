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
      await service.saveExternalResourceResponse('igw-1', { igwId: 'igw-0published' });

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0published' });
    });

    it('should hold the record of a resource whose id is not a legal file name', async () => {
      await service.saveExternalResourceResponse('image-tag-family/image-0-0-1', { digest: 'sha256:abc' });

      await expect(service.getResourceResponse('image-tag-family/image-0-0-1')).resolves.toEqual({
        digest: 'sha256:abc',
      });
    });

    it('should fall back to the committed graph once the published record is cleared', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });
      await service.saveExternalResourceResponse('igw-1', { igwId: 'igw-0published' });
      await service.deleteExternalResourceResponse('igw-1');

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0committed' });
    });
  });
});
