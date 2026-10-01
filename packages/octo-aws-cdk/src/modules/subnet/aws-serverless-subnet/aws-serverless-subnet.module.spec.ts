import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsServerlessSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-serverless-subnet.anchor.schema.js';
import type { AwsSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet.anchor.schema.js';
import { AwsServerlessSubnetModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
      'AwsServerlessRegionAnchor',
      { awsRegionId: 'us-east-1', regionId: 'region', serverless: true },
      region,
    ),
  );
}

describe('AwsServerlessSubnetModule UT', () => {
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

  it('should create a subnet that creates no resources', async () => {
    await setup(testModuleContainer);
    const { modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsServerlessSubnetModule>(
          {
            inputs: { region: stub('${{testModule.model.region}}') },
            moduleId: 'subnet',
            type: AwsServerlessSubnetModule,
          },
          { filterByModuleIds: ['subnet'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(modelTransaction).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "subnetId",
           "node": "subnet=region-default,region=region,account=123,app=test-app",
           "value": "region-default",
         },
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
  });

  describe('validation', () => {
    it('should not match the anchor of a subnet with a network', async () => {
      const {
        subnet: [subnet],
      } = await testModuleContainer.createTestModels('testModule', {
        account: ['aws,123'],
        app: ['test-app'],
        region: ['region'],
        subnet: ['private-subnet'],
      });
      subnet.addAnchor(
        testModuleContainer.createTestAnchor<AwsSubnetAnchorSchema>(
          'AwsSubnetAnchor',
          {
            AvailabilityZone: 'us-east-1a',
            awsAccountId: '123',
            awsRegionId: 'us-east-1',
            CidrBlock: '10.0.0.0/24',
            subnetName: 'private-subnet',
          },
          subnet,
        ),
      );

      expect(await subnet.getAnchorsMatchingSchema(AwsServerlessSubnetAnchorSchema, [])).toEqual([]);
    });

    it('should reject a second subnet in the region', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsServerlessSubnetModule>([
            {
              inputs: { region: stub('${{testModule.model.region}}') },
              moduleId: 'subnet-1',
              type: AwsServerlessSubnetModule,
            },
            {
              inputs: { region: stub('${{testModule.model.region}}') },
              moduleId: 'subnet-2',
              type: AwsServerlessSubnetModule,
            },
          ])
          .next(),
      ).rejects.toThrow('Region "region" already has a subnet!');
    });
  });
});
