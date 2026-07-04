import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type App, type Server, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsEcsServerAnchorSchema } from '../../../../src/anchors/aws-ecs/aws-ecs-server.anchor.schema.js';
import type { AwsIamRoleAnchorSchema } from '../../../../src/anchors/aws-iam/aws-iam-role.anchor.schema.js';
import { AwsEcsDeploymentModule } from '../../../../src/modules/deployment/aws-ecs-deployment/index.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App; server: Server }> {
  const {
    app: [app],
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    app: ['test-app'],
    server: ['backend'],
  });

  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsServerAnchorSchema>(
      'AwsEcsServerAnchor',
      { deploymentType: 'ecs', serverKey: 'backend' },
      server,
    ),
  );
  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsIamRoleAnchorSchema>(
      'AwsIamRoleAnchor',
      { iamRoleName: 'iamRoleName' },
      server,
    ),
  );

  return { app, server };
}

describe('AwsEcsDeploymentModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate no terraform resources to run against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });

    const { outputDir, resourceDiffs } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    // The deployment module contributes no terraform of its own (the task definition only materializes
    // once composed with an execution), so generateHcl emits nothing for terragrunt to run.
    expect(resourceDiffs.flat()).toHaveLength(0);
    expect(await TerragruntUtility.collectTerraformResources(outputDir)).toEqual([]);
  }, 300_000);
});
