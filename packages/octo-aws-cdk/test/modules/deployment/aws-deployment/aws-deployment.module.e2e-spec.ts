import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsServerAnchorSchema } from '../../../../src/anchors/aws-server/aws-server.anchor.schema.js';
import { AwsDeploymentModule } from '../../../../src/modules/deployment/aws-deployment/index.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    app: ['test-app'],
    server: ['backend'],
  });

  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerAnchorSchema>(
      'AwsServerAnchor',
      { grants: { dynamodb: [], s3: [] }, serverKey: 'backend' },
      server,
    ),
  );
}

describe('AwsDeploymentModule E2E', () => {
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
    await setup(testModuleContainer);
    const { hclRender, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsDeploymentModule>(
          {
            inputs: {
              command: ['command'],
              cpu: 256,
              deploymentTag: 'v1',
              imageUri: 'uri',
              memory: 512,
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              server: stub('${{testModule.model.server}}'),
            },
            moduleId: 'deployment',
            type: AwsDeploymentModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    // The deployment module contributes no terraform of its own (the code only materializes once
    // run by an execution), so generate emits nothing for terragrunt to run.
    expect(resourceDiffs.flat()).toHaveLength(0);
    expect(Object.keys(HclUtility.parse(hclRender).resource)).toEqual([]);
  }, 300_000);
});
