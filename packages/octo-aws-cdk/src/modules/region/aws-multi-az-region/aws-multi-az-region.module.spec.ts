import {
  CreateInternetGatewayCommand,
  CreateVpcCommand,
  DescribeInternetGatewaysCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsMultiAzRegionId } from './index.schema.js';
import { AwsMultiAzRegionModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { account: ['aws,123'], app: ['test-app'] });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  return { account, app };
}

describe('AwsMultiAzRegionModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const EC2ClientMock = mockClient(EC2Client);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    EC2ClientMock.on(CreateVpcCommand)
      .resolves({ Vpc: { VpcId: 'VpcId' } })
      .on(CreateInternetGatewayCommand)
      .resolves({ InternetGateway: { InternetGatewayId: 'InternetGatewayId' } })
      .on(DescribeInternetGatewaysCommand)
      .resolves({ InternetGateways: [{ InternetGatewayId: 'InternetGatewayId' }] });

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: EC2Client,
            value: EC2ClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0, throwOnError: true });
    });
  });

  afterEach(async () => {
    EC2ClientMock.restore();
    ResourceGroupsTaggingAPIClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['region'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsMultiAzRegionModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddVpcResourceAction",
       ],
       [
         "AddInternetGatewayResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-test-region",
           "value": "@octo/vpc=vpc-test-region",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-test-region",
           "value": "@octo/internet-gateway=igw-test-region",
         },
       ],
       [],
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-test-region",
           "value": "@octo/vpc=vpc-test-region",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-test-region",
           "value": "@octo/internet-gateway=igw-test-region",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-test-region",
           "value": "@octo/vpc=vpc-test-region",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-test-region",
           "value": "@octo/internet-gateway=igw-test-region",
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/vpc=vpc-test-region",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/internet-gateway=igw-test-region",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
       ],
       [],
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/vpc=vpc-test-region",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/internet-gateway=igw-test-region",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
       ],
       [],
     ]
    `);
  });

  it('should handle moduleId changes', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region-1',
      type: AwsMultiAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-test-region",
           "value": "@octo/vpc=vpc-test-region",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-test-region",
           "value": "@octo/internet-gateway=igw-test-region",
         },
       ],
       [],
     ]
    `);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region-2',
      type: AwsMultiAzRegionModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  describe('validation', () => {
    it('should validate minimum regionIds', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region',
          type: AwsMultiAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"At least 2 regionIds are required!"`);
    });

    it('should validate overlapping CIDR blocks', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-1',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region1',
          type: AwsMultiAzRegionModule,
        });
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-2',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region2',
          type: AwsMultiAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlapping VPC cidr blocks are not allowed!"`);
    });

    it('should handle name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'changed-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      const resultUpdateName = await testModuleContainer.commit(appUpdateName, { enableResourceCapture: true });
      expect(resultUpdateName.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/vpc=vpc-test-region",
             "value": "@octo/vpc=vpc-test-region",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/internet-gateway=igw-test-region",
             "value": "@octo/internet-gateway=igw-test-region",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/vpc=vpc-changed-region",
             "value": "@octo/vpc=vpc-changed-region",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/internet-gateway=igw-changed-region",
             "value": "@octo/internet-gateway=igw-changed-region",
           },
         ],
         [],
       ]
      `);
    });

    it('should handle regionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1B, AwsMultiAzRegionId.AWS_US_EAST_1C],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateRegionId, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Cannot update VPC once it has been created!"`);
    });

    it('should handle vpcCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateVpcCidrBlock } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/16',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateVpcCidrBlock, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Cannot update VPC once it has been created!"`);
    });
  });
});
