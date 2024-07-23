import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { AwsServer, OctoAwsCdkPackageMock, RegionId, S3StorageAccess, S3StorageService } from '../../../index.js';
import type { IIamRoleResponse } from '../../../resources/iam/iam-role.interface.js';

describe('S3StorageService UT', () => {
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
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should test e2e', async () => {
      // Create a S3 storage, and a server.
      const app = new App('test');
      const service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
      app.addService(service);
      const server = new AwsServer('Backend');
      app.addServer(server);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "s3-storage=bucket-test-bucket",
             "value": "bucket-test-bucket",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "iam-role=iam-role-Backend-ServerRole",
             "value": "iam-role-Backend-ServerRole",
           },
         ],
       ]
      `);

      // Allow Server to access one of the S3StorageService directory.
      service.addDirectory('uploads');
      await service.allowDirectoryAccess(server, 'uploads', S3StorageAccess.READ);
      const resourceTransactionResult2 = (await testModuleContainer.commit(app)).resourceTransaction;
      (resourceTransactionResult2[0][0].value as any).overlay = (
        resourceTransactionResult2[0][0].value as any
      ).overlay.overlayId;
      /* eslint-disable spellcheck/spell-checker */
      expect(resourceTransactionResult2).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
             "model": "iam-role=iam-role-Backend-ServerRole",
             "value": {
               "action": "add",
               "overlay": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
             },
           },
         ],
       ]
      `);
      /* eslint-enable */

      // Revoke Server access from one of the S3StorageService directory.
      await service.revokeDirectoryAccess(server, 'uploads', S3StorageAccess.READ);
      const resourceTransactionResult3 = (await testModuleContainer.commit(app)).resourceTransaction;
      (resourceTransactionResult3[0][0].value as any).overlay = (
        resourceTransactionResult3[0][0].value as any
      ).overlay.overlayId;
      /* eslint-disable spellcheck/spell-checker */
      expect(resourceTransactionResult3).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
             "model": "iam-role=iam-role-Backend-ServerRole",
             "value": {
               "action": "delete",
               "overlay": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
             },
           },
         ],
       ]
      `);
      /* eslint-enable */

      // Remove all directories, and delete the service.
      await service.removeDirectory('uploads');
      service.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "s3-storage=bucket-test-bucket",
             "value": "bucket-test-bucket",
           },
         ],
       ]
      `);
    });
  });
});
