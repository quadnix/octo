import { ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
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
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import type { EcrImageSchema } from '../../../resources/ecr/ecr-image.schema.js';
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

  region.addAnchor(
    new AwsRegionAnchor(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a' },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsImageModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
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

  describe('getEcrRepositoryAuthorizationToken()', () => {
    it('should return repository commands', async () => {
      await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsImageModule>({
        inputs: {
          imageFamily: 'family',
          imageName: 'image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsImageModule,
      });

      const ecrClient = await container.get(ECRClient, {
        metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
      });
      ecrClient.send = async (instance: unknown): Promise<unknown> => {
        if (instance instanceof GetAuthorizationTokenCommand) {
          return {
            authorizationData: [
              {
                // eslint-disable-next-line spellcheck/spell-checker
                authorizationToken: 'QVdTOnRva2Vu', // AWS:token
                proxyEndpoint: 'https://123.dkr.ecr.us-east-1.amazonaws.com',
              },
            ],
          };
        }
      };

      const awsImageModule = testModuleContainer.octo.getModule<AwsImageModule>('image')!;
      const ecrRepositoryCommands = await awsImageModule.getEcrRepositoryCommands('family', 'image', 'v1', {
        awsAccountId: '123',
        awsRegionId: 'us-east-1',
      });
      expect(ecrRepositoryCommands).toMatchInlineSnapshot(`
       {
         "login": "echo token | docker login --username AWS --password-stdin 123.dkr.ecr.us-east-1.amazonaws.com",
         "push": "docker push 123.dkr.ecr.us-east-1.amazonaws.com/family/image:v1",
         "tag": "docker tag family/image:v1 123.dkr.ecr.us-east-1.amazonaws.com/family/image:v1",
       }
      `);
    });
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
