import { EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Container,
  type Filesystem,
  type Region,
  type Subnet,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddEfsMountTargetResourceAction } from '../../../resources/efs-mount-target/actions/add-efs-mount-target.resource.action.js';
import type { EfsMountTarget } from '../../../resources/efs-mount-target/index.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsSubnetFilesystemMountModule } from './aws-subnet-filesystem-mount.module.js';
import { AddSubnetFilesystemMountOverlayAction } from './overlays/subnet-filesystem-mount/actions/add-subnet-filesystem-mount.overlay.action.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; filesystem: Filesystem; region: Region; subnet: Subnet }> {
  const {
    account: [account],
    app: [app],
    filesystem: [filesystem],
    region: [region],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,account'],
    app: ['test-app'],
    filesystem: ['test-filesystem'],
    region: ['region'],
    subnet: ['private-subnet'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  await testModuleContainer.createTestResources(
    'testModule',
    [
      {
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
      },
      { properties: { awsRegionId: 'us-east-1' }, resourceContext: '@octo/vpc=vpc-region' },
      { resourceContext: '@octo/subnet=subnet-region-private-subnet', response: { SubnetId: 'SubnetId' } },
    ],
    { save: true },
  );

  return { account, app, filesystem, region, subnet };
}

describe('AwsSubnetFilesystemMountModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let container: Container;
  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsRegionId: 'us-east-1', package: '@octo' },
            type: EFSClient,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0 });
    });

    // Register resource captures.
    testModuleContainer.registerCapture<EfsMountTarget>('@octo/efs=efs-region-test-filesystem', {
      MountTargetId: 'MountTargetId',
      NetworkInterfaceId: 'NetworkInterfaceId',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call actions with correct inputs', async () => {
    const addSubnetFilesystemMountOverlayAction = await container.get(AddSubnetFilesystemMountOverlayAction);
    const addSubnetFilesystemMountOverlayActionSpy = jest.spyOn(addSubnetFilesystemMountOverlayAction, 'handle');
    const addEfsMountTargetResourceAction = await container.get(AddEfsMountTargetResourceAction);
    const addEfsMountTargetResourceActionSpy = jest.spyOn(addEfsMountTargetResourceAction, 'handle');

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetFilesystemMountModule>({
      inputs: {
        filesystem: stub('${{testModule.model.filesystem}}'),
        subnet: stub('${{testModule.model.subnet}}'),
      },
      moduleId: 'subnetFilesystemOverlay',
      type: AwsSubnetFilesystemMountModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    /* eslint-disable max-len */
    expect(addSubnetFilesystemMountOverlayActionSpy).toHaveBeenCalledTimes(1);
    expect(addSubnetFilesystemMountOverlayActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "filesystem": {
           "context": "filesystem=test-filesystem,region=region,account=account,app=test-app",
           "filesystemName": "test-filesystem",
         },
         "subnet": {
           "context": "subnet=region-private-subnet,region=region,account=account,app=test-app",
           "options": {
             "disableSubnetIntraNetwork": false,
             "subnetType": "private",
           },
           "region": {
             "context": "region=region,account=account,app=test-app",
           },
           "subnetId": "region-private-subnet",
           "subnetName": "private-subnet",
         },
       },
       "models": {},
       "overlays": {
         "subnet-filesystem-mount-overlay-private-subnet-test-filesystem": {
           "anchors": [
             {
               "anchorId": "AwsFilesystemAnchor",
               "parent": {
                 "context": "filesystem=test-filesystem,region=region,account=account,app=test-app",
               },
               "properties": {},
             },
             {
               "anchorId": "AwsSubnetFilesystemMountAnchor",
               "parent": {
                 "context": "subnet=region-private-subnet,region=region,account=account,app=test-app",
               },
               "properties": {},
             },
           ],
           "context": "@octo/subnet-filesystem-mount-overlay=subnet-filesystem-mount-overlay-private-subnet-test-filesystem",
           "overlayId": "subnet-filesystem-mount-overlay-private-subnet-test-filesystem",
           "properties": {
             "filesystemName": "test-filesystem",
             "regionId": "region",
             "subnetId": "region-private-subnet",
             "subnetName": "private-subnet",
           },
         },
       },
       "resources": {},
     }
    `);
    /* eslint-enable */

    expect(addEfsMountTargetResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addEfsMountTargetResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
       "value": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
     }
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetFilesystemMountModule>({
      inputs: {
        filesystem: stub('${{testModule.model.filesystem}}'),
        subnet: stub('${{testModule.model.subnet}}'),
      },
      moduleId: 'subnetFilesystemOverlay',
      type: AwsSubnetFilesystemMountModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
         },
       ],
       [],
     ]
    `);

    const { app: app2 } = await setup(testModuleContainer);
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
         },
       ],
       [],
     ]
    `);
  });
});
