import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsServerlessRegionId } from './index.schema.js';
import { AwsServerlessRegionModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    account: [account],
  } = await testModuleContainer.createTestModels('testModule', { account: ['aws,123'], app: ['test-app'] });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );
}

describe('AwsServerlessRegionModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should create a region that creates no resources', async () => {
    await setup(testModuleContainer);
    const { modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsServerlessRegionModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionId: AwsServerlessRegionId.AWS_US_EAST_1,
            },
            moduleId: 'region',
            type: AwsServerlessRegionModule,
          },
          { filterByModuleIds: ['region'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(modelTransaction).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "regionId",
           "node": "region=test-region,account=123,app=test-app",
           "value": "test-region",
         },
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
  });

  describe('validation', () => {
    it('should not match the anchor of a region with a network', async () => {
      const {
        region: [region],
      } = await testModuleContainer.createTestModels('testModule', {
        account: ['aws,123'],
        app: ['test-app'],
        region: ['region'],
      });
      region.addAnchor(
        testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
          'AwsRegionAnchor',
          { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'region', vpcCidrBlock: '10.0.0.0/16' },
          region,
        ),
      );

      expect(await region.getAnchorsMatchingSchema(AwsServerlessRegionAnchorSchema, [])).toEqual([]);
    });

    it('should validate duplicate region name', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsServerlessRegionModule>(
            [
              {
                inputs: {
                  account: stub('${{testModule.model.account}}'),
                  name: 'test-region',
                  regionId: AwsServerlessRegionId.AWS_US_EAST_1,
                },
                moduleId: 'region-1',
                type: AwsServerlessRegionModule,
              },
              {
                inputs: {
                  account: stub('${{testModule.model.account}}'),
                  name: 'test-region',
                  regionId: AwsServerlessRegionId.AWS_US_WEST_2,
                },
                moduleId: 'region-2',
                type: AwsServerlessRegionModule,
              },
            ],
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrow('Region already exists!');
    });
  });
});
