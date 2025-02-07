import { ECSClient } from '@aws-sdk/client-ecs';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Region,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/ecs-cluster.schema.js';
import { AwsEnvironmentModule } from './aws-environment.module.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  region.addAnchor(
    new AwsRegionAnchor(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a' },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsEnvironmentModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
            type: ECSClient,
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

    // Register resource captures.
    testModuleContainer.registerCapture<EcsClusterSchema>('@octo/ecs-cluster=ecs-cluster-region-qa', {
      clusterArn: 'clusterArn',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        environmentVariables: { ENV_NAME: 'qa' },
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEnvironmentModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['environment'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddEnvironmentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddEcsClusterResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEnvironmentModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
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
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
         },
       ],
       [],
     ]
    `);
  });
});
