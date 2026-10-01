import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { AwsServerlessEnvironmentAnchorSchema } from '../../../anchors/aws-environment/aws-serverless-environment.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsServerlessEnvironmentModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer, { serverless = true } = {}): Promise<void> {
  const {
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  if (serverless) {
    region.addAnchor(
      testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
        'AwsServerlessRegionAnchor',
        { awsRegionId: 'us-east-1', regionId: 'region', serverless: true },
        region,
      ),
    );
  } else {
    region.addAnchor(
      testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
        'AwsRegionAnchor',
        { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'region', vpcCidrBlock: '10.0.0.0/16' },
        region,
      ),
    );
  }
}

describe('AwsServerlessEnvironmentModule UT', () => {
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

  it('should create an environment that creates no resources, and anchor its variables', async () => {
    await setup(testModuleContainer);
    const { modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsServerlessEnvironmentModule>(
          {
            inputs: {
              environmentName: 'qa',
              environmentVariables: { NODE_ENV: 'qa' },
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'environment',
            type: AwsServerlessEnvironmentModule,
          },
          { filterByModuleIds: ['environment'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsServerlessEnvironmentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);

    const environment = modelTransaction.flat().find((d) => d.field === 'environmentName')!.node as any;
    const [environmentAnchor] = await environment.getAnchorsMatchingSchema(AwsServerlessEnvironmentAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    expect(environmentAnchor.getSchemaInstance().properties).toEqual({
      environmentName: 'qa',
      environmentVariables: { NODE_ENV: 'qa' },
      serverless: true,
    });
  });

  describe('validation', () => {
    it('should reject a region with a network', async () => {
      await setup(testModuleContainer, { serverless: false });

      await expect(
        testModuleContainer
          .runModules<AwsServerlessEnvironmentModule>({
            inputs: { environmentName: 'qa', region: stub('${{testModule.model.region}}') },
            moduleId: 'environment',
            type: AwsServerlessEnvironmentModule,
          })
          .next(),
      ).rejects.toThrow('Property "region" in schema could not be validated!');
    });
  });
});
