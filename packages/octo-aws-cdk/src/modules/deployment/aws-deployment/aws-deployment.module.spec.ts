import { type DiffMetadata, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import type { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import type { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';
import { AwsDeploymentModule } from './index.js';

/**
 * A server, and an ECR image, as `AwsServerModule` and `AwsEcrImageModule` would have left them.
 */
async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    image: [image],
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    image: ['family/image'],
    server: ['backend'],
  });

  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerAnchorSchema>(
      'AwsServerAnchor',
      { grants: { dynamodb: [], iamStatements: [], s3: [] }, serverKey: 'backend' },
      server,
    ),
  );

  image.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcrImageAnchorSchema>(
      'AwsEcrImageAnchor',
      { imageId: image.imageId },
      image,
    ),
  );
}

async function getDeploymentAnchorProperties(
  modelTransaction: DiffMetadata[][],
): Promise<AwsDeploymentAnchorSchema['properties']> {
  const deployment = modelTransaction.flat().find((d) => d.field === 'deploymentTag')!.node as any;
  const [deploymentAnchor] = await deployment.getAnchorsMatchingSchema(AwsDeploymentAnchorSchema, [], {
    searchBoundaryMembers: false,
  });
  return deploymentAnchor.getSchemaInstance().properties;
}

describe('AwsDeploymentModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should create a deployment of an image URI that creates no resources', async () => {
    await setup(testModuleContainer);
    const { modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsDeploymentModule>(
          {
            inputs: {
              command: ['node', 'webserver'],
              cpu: 256,
              deploymentTag: 'v1',
              imageUri: 'docker.io/ealen/echo-server:0.9.2',
              memory: 512,
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          },
          { filterByModuleIds: ['deployment'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDeploymentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
    expect(await getDeploymentAnchorProperties(modelTransaction)).toMatchInlineSnapshot(`
     {
       "command": [
         "node",
         "webserver",
       ],
       "cpu": 256,
       "image": {
         "kind": "uri",
         "uri": "docker.io/ealen/echo-server:0.9.2",
       },
       "memory": 512,
       "ports": [
         {
           "containerPort": 80,
           "protocol": "tcp",
         },
       ],
       "timeoutInSeconds": null,
     }
    `);
  });

  it('should link a deployment of an ECR image to the image', async () => {
    await setup(testModuleContainer);
    const { modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsDeploymentModule>(
          {
            inputs: {
              deploymentTag: 'v1',
              image: stub('${{testModule.model.image}}'),
              imageTag: '0.0.1',
              memory: 512,
              server: stub('${{testModule.model.server}}'),
              timeoutInSeconds: 30,
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          },
          { filterByModuleIds: ['deployment'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDeploymentModelAction",
       ],
       [
         "AddAwsDeploymentImageOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
    expect((await getDeploymentAnchorProperties(modelTransaction)).image).toEqual({
      imageId: 'family/image',
      imageTag: '0.0.1',
      kind: 'ecr',
    });
  });

  it('should handle moduleId change', async () => {
    const deploymentModule = (
      moduleId: string,
    ): { inputs: any; moduleId: string; type: typeof AwsDeploymentModule } => ({
      inputs: {
        deploymentTag: 'v1',
        imageUri: 'docker.io/ealen/echo-server:0.9.2',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId,
      type: AwsDeploymentModule,
    });

    await setup(testModuleContainer);
    await testModuleContainer.runModules<AwsDeploymentModule>(deploymentModule('deployment-1')).next();

    await setup(testModuleContainer);
    const { resourceDiffs } = (
      await testModuleContainer.runModules<AwsDeploymentModule>(deploymentModule('deployment-2')).next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
  });

  describe('validation', () => {
    it('should reject an image named two ways', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsDeploymentModule>({
            inputs: {
              deploymentTag: 'v1',
              image: stub('${{testModule.model.image}}'),
              imageTag: '0.0.1',
              imageUri: 'docker.io/ealen/echo-server:0.9.2',
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          })
          .next(),
      ).rejects.toThrow('Name the image either by "image" and "imageTag", or by "imageUri"!');
    });

    it('should reject an image with no tag', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsDeploymentModule>({
            inputs: {
              deploymentTag: 'v1',
              image: stub('${{testModule.model.image}}'),
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          })
          .next(),
      ).rejects.toThrow('Name the image either by "image" and "imageTag", or by "imageUri"!');
    });

    it('should reject a deployment with no image', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsDeploymentModule>({
            inputs: {
              deploymentTag: 'v1',
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          })
          .next(),
      ).rejects.toThrow('Name the image either by "image" and "imageTag", or by "imageUri"!');
    });

    it('should reject a tag with no image', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsDeploymentModule>({
            inputs: {
              deploymentTag: 'v1',
              imageTag: '0.0.1',
              imageUri: 'docker.io/ealen/echo-server:0.9.2',
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          })
          .next(),
      ).rejects.toThrow('Name the image either by "image" and "imageTag", or by "imageUri"!');
    });

    it('should validate deploymentTag length', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsDeploymentModule>({
            inputs: {
              deploymentTag: '',
              imageUri: 'docker.io/ealen/echo-server:0.9.2',
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          })
          .next(),
      ).rejects.toThrow('Property "deploymentTag" in schema could not be validated!');
    });
  });
});
