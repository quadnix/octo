import { App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AwsServer, OctoAwsCdkPackageMock, RegionId, S3StorageAccess, S3StorageService } from '../../../index.js';
import type { IIamRoleResponse } from '../../../resources/iam/iam-role.interface.js';

describe('S3StorageService UT', () => {
  const stateProvider = new TestStateProvider();

  beforeAll(async () => {
    await TestContainer.create(
      {
        importFrom: [OctoAwsCdkPackageMock],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  describe('diff()', () => {
    let testModuleContainer: TestModuleContainer;

    const TestModule = async ({
      commit = false,
      includeStorageService = false,
      includeServerAccessToUploadsDirectory = false,
    }: Record<string, boolean> = {}): Promise<App> => {
      const app = new App('test');
      const server = new AwsServer('Backend');
      app.addServer(server);

      if (includeStorageService) {
        const service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
        app.addService(service);

        if (includeServerAccessToUploadsDirectory) {
          service.addDirectory('uploads');
          await service.allowDirectoryAccess(server, 'uploads', S3StorageAccess.READ);
        }
      }

      if (commit) {
        await testModuleContainer.commit(app);
      }
      return app;
    };

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {
          'iam-role-Backend-ServerRole': {
            response: <Partial<IIamRoleResponse>>{
              Arn: 'Arn',
              // eslint-disable-next-line spellcheck/spell-checker
              policies: { 's3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac': ['PolicyArn'] },
              RoleId: 'RoleId',
              RoleName: 'RoleName',
            },
          },
        },
      });
      await testModuleContainer.initialize(stateProvider);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should setup app', async () => {
      await expect(TestModule({ commit: true })).resolves.not.toThrow();
    });

    it('should add storage service', async () => {
      const app = await TestModule({
        commit: false,
        includeStorageService: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "s3-storage=bucket-test-bucket",
             "value": "bucket-test-bucket",
           },
         ],
       ]
      `);
    });

    it('should allow server to access directory in S3StorageService', async () => {
      const app = await TestModule({
        commit: false,
        includeServerAccessToUploadsDirectory: true,
        includeStorageService: true,
      });

      const resourceTransactionResult = (await testModuleContainer.commit(app)).resourceTransaction;
      (resourceTransactionResult[0][0].value as any).overlay = (
        resourceTransactionResult[0][0].value as any
      ).overlay.overlayId;
      /* eslint-disable spellcheck/spell-checker */
      expect(resourceTransactionResult).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
             "node": "iam-role=iam-role-Backend-ServerRole",
             "value": {
               "action": "add",
               "overlay": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
               "overlayName": "s3-storage-access-overlay",
             },
           },
         ],
       ]
      `);
      /* eslint-enable */
    });

    it('should revoke server access to directory in S3StorageService', async () => {
      const app = await TestModule({
        commit: false,
        includeStorageService: true,
      });

      /* eslint-disable spellcheck/spell-checker */
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
             "node": "iam-role=iam-role-Backend-ServerRole",
             "value": {
               "action": "delete",
               "overlayName": "s3-storage-access-overlay",
             },
           },
         ],
       ]
      `);
      /* eslint-enable */
    });

    it('should remove storage service', async () => {
      const app = await TestModule({
        commit: false,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "s3-storage=bucket-test-bucket",
             "value": "bucket-test-bucket",
           },
         ],
       ]
      `);
    });
  });
});
