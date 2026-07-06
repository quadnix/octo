import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { type App, TestContainer, TestModuleContainer, TestStateProvider, stub } from '@quadnix/octo';
import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-localstack-account';
import { type AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
import axios from 'axios';
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCALSTACK_ACCOUNT_ID = '000000000000';
const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const AWS_REGION_ID = 'us-east-1';

const outputDir = join(__dirname, '.octo', 'generated');

jest.setTimeout(600_000);

describe('Main IT', () => {
  let app: App;
  let bucketName: string;
  let bucketNameNormalized: string;
  let environment: StartedDockerComposeEnvironment;
  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let testModuleContainer: TestModuleContainer;

  beforeAll(async () => {
    environment = await new DockerComposeEnvironment(__dirname, 'docker-compose.yml')
      .withWaitStrategy('localstack-aws-s3-website', Wait.forLogMessage('Ready.'))
      .up();

    stateProvider = new TestStateProvider();
  });

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(stateProvider);

    testModuleContainer.registerTerraformConfig({
      minTerraformVersion: '1.6.0',
      providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', LOCALSTACK_ACCOUNT_ID, AWS_REGION_ID, {
      access_key: 'test',
      endpoints: { s3: LOCALSTACK_ENDPOINT, sts: LOCALSTACK_ENDPOINT },
      s3_use_path_style: true,
      secret_key: 'test',
      skip_credentials_validation: true,
      skip_metadata_api_check: true,
      skip_requesting_account_id: true,
    });

    ({
      app: [app],
    } = await testModuleContainer.createTestModels('app-module', { app: ['aws-s3-website'] }));

    moduleDefinitions = new ModuleDefinitions();
    // Replace real app with test app.
    moduleDefinitions.remove('app-module');
    // Replace real aws credentials with localstack.
    moduleDefinitions.update(AwsLocalstackAccountModule, 'account-module', {
      app: stub<App>('${{app-module.model.app}}'),
    });

    const { moduleInputs } = moduleDefinitions.get<AwsS3StaticWebsiteServiceModule>('s3-website-service-module')!;
    bucketName = moduleInputs.bucketName;
    bucketNameNormalized = bucketName.replace(/[^\w-]/g, '-');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  afterAll(async () => {
    if (environment) {
      await environment.down({ removeVolumes: true, timeout: 10_000 });
    }
  });

  it('should create the website', async () => {
    const { responses } = (
      await testModuleContainer
        .runModules(
          app,
          moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
          { outputDir, terraformTarget: 'apply' },
        )
        .next()
    ).value!;

    expect(responses[`@octo/s3-website=bucket-${bucketNameNormalized}`]).toEqual({
      Arn: `arn:aws:s3:::${bucketName}`,
      awsRegionId: AWS_REGION_ID,
    });

    const indexContent = await axios.get(`${LOCALSTACK_ENDPOINT}/${bucketName}/index.html`);
    expect(indexContent.data).toContain('This is my first website!');
    const errorContent = await axios.get(`${LOCALSTACK_ENDPOINT}/${bucketName}/error.html`);
    expect(errorContent.data).toContain('This is an error!');
  });

  it('should re-apply the identical intent with no octo changes', async () => {
    const { resourceDiffs } = (
      await testModuleContainer
        .runModules(
          app,
          moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
          { outputDir, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
  });

  it('should delete the website and leave octo state empty', async () => {
    for (const moduleId of moduleDefinitions
      .getAll()
      .map((md) => md.moduleId)
      .filter((moduleId) => moduleId !== 'account-module')) {
      moduleDefinitions.remove(moduleId);
    }

    const { responses } = (
      await testModuleContainer
        .runModules(
          app,
          moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
          { outputDir, terraformTarget: 'apply' },
        )
        .next()
    ).value!;

    expect(responses).toEqual({});

    await expect(axios.get(`${LOCALSTACK_ENDPOINT}/${bucketName}/index.html`)).rejects.toThrow();
  });
});
