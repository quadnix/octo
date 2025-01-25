import { ECRClient } from '@aws-sdk/client-ecr';
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
import { type EcrImageSchema } from '../../../resources/ecr/index.js';
import { AwsImageModule } from './aws-image.module.js';

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

  await testModuleContainer.createTestResources(
    'testModule',
    [
      {
        properties: { awsAvailabilityZones: ['us-east-1a'], awsRegionId: 'us-east-1' },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
      },
    ],
    { save: true },
  );

  return { account, app, region };
}

describe('AwsImageModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
            type: ECRClient,
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
    testModuleContainer.registerCapture<EcrImageSchema>('@octo/ecs-cluster=ecs-cluster-region-qa', {
      registryId: 'RegistryId',
      repositoryArn: 'RepositoryArn',
      repositoryName: 'RepositoryName',
      repositoryUri: 'RepositoryUri',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsImageModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['image'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddImageModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddEcrImageResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsImageModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecr-image=ecr-us-east-1-family/image",
           "value": "@octo/ecr-image=ecr-us-east-1-family/image",
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
           "node": "@octo/ecr-image=ecr-us-east-1-family/image",
           "value": "@octo/ecr-image=ecr-us-east-1-family/image",
         },
       ],
       [],
     ]
    `);
  });
});
