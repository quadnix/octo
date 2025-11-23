import { CreateRepositoryCommand, ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
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
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcrImageModule } from './index.js';

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
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsEcrImageModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  const ECRClientMock = mockClient(ECRClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    ECRClientMock.on(CreateRepositoryCommand)
      .resolves({
        repository: {
          registryId: 'RegistryId',
          repositoryArn: 'RepositoryArn',
          repositoryName: 'RepositoryName',
          repositoryUri: 'RepositoryUri',
        },
      })
      .on(GetAuthorizationTokenCommand)
      .resolves({
        authorizationData: [
          {
            // eslint-disable-next-line spellcheck/spell-checker
            authorizationToken: 'QVdTOnRva2Vu', // AWS:token
            proxyEndpoint: 'https://123.dkr.ecr.us-east-1.amazonaws.com',
          },
        ],
      });

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: ECRClient,
            value: ECRClientMock,
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
    await testModuleContainer.initialize(new TestStateProvider());
  });

  afterEach(async () => {
    ECRClientMock.reset();
    ResourceGroupsTaggingAPIClientMock.reset();

    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  describe('getEcrRepositoryAuthorizationToken()', () => {
    it('should return repository commands', async () => {
      await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcrImageModule>({
        inputs: {
          imageFamily: 'family',
          imageName: 'image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsEcrImageModule,
      });

      const awsImageModule = testModuleContainer.octo.getModule<AwsEcrImageModule>('image')!;
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
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['image'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcrImageModelAction",
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
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
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

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
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

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecr-image=ecr-us-east-1-family/image",
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

    const { app: app3 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecr-image=ecr-us-east-1-family/image",
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
});
