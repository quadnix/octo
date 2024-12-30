import { ECSClient } from '@aws-sdk/client-ecs';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Container,
  type Region,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddEcsClusterResourceAction } from '../../../resources/ecs-cluster/actions/add-ecs-cluster.resource.action.js';
import type { EcsCluster } from '../../../resources/ecs-cluster/index.js';
import { AwsEnvironmentModule } from './aws-environment.module.js';
import { AddEnvironmentModelAction } from './models/environment/actions/add-environment.model.action.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,account'],
    app: ['test-app'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  await testModuleContainer.createTestResources(
    'testModule',
    [{ properties: { awsRegionId: 'us-east-1' }, resourceContext: '@octo/vpc=vpc-region' }],
    { save: true },
  );

  return { account, app, region };
}

describe('AwsEnvironmentModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsRegionId: 'us-east-1', package: '@octo' },
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
    testModuleContainer.registerCapture<EcsCluster>('@octo/ecs-cluster=ecs-cluster-region-qa', {
      clusterArn: 'clusterArn',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addEnvironmentModelAction = await container.get(AddEnvironmentModelAction);
    const addEnvironmentModelActionSpy = jest.spyOn(addEnvironmentModelAction, 'handle');
    const addEcsClusterResourceAction = await container.get(AddEcsClusterResourceAction);
    const addEcsClusterResourceActionSpy = jest.spyOn(addEcsClusterResourceAction, 'handle');

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

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addEnvironmentModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addEnvironmentModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "environmentName": "qa",
         "environmentVariables": {
           "ENV_NAME": "qa",
         },
         "region": {
           "context": "region=region,account=account,app=test-app",
           "regionId": "region",
         },
       },
       "models": {
         "environment": {
           "context": "environment=qa,region=region,account=account,app=test-app",
           "environmentName": "qa",
           "environmentVariables": {
             "ENV_NAME": "qa",
           },
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);

    expect(addEcsClusterResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addEcsClusterResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
       "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
     }
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
