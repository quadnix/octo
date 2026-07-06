import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { type App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { type AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
import axios from 'axios';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const outputDir = join(__dirname, '.octo', 'generated');

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-s3-website' };

jest.setTimeout(600_000);

describe('Main E2E', () => {
  let app: App;
  let bucketName: string;
  let bucketNameNormalized: string;
  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let testModuleContainer: TestModuleContainer;

  beforeAll(() => {
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
    testModuleContainer.registerTerraformProvider('aws', config.AWS_ACCOUNT_ID, AWS_REGION_ID);

    // Register tags on all resources.
    testModuleContainer.registerTags([{ scope: {}, tags: E2E_TAGS }]);

    ({
      app: [app],
    } = await testModuleContainer.createTestModels('app-module', { app: ['aws-s3-website'] }));

    moduleDefinitions = new ModuleDefinitions();
    // Replace real app with test app.
    moduleDefinitions.remove('app-module');

    const { moduleInputs } = moduleDefinitions.get<AwsS3StaticWebsiteServiceModule>('s3-website-service-module')!;
    bucketName = moduleInputs.bucketName;
    bucketNameNormalized = bucketName.replace(/[^\w-]/g, '-');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
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

    const indexContent = await axios.get(`http://${bucketName}.s3-website-${AWS_REGION_ID}.amazonaws.com/index.html`);
    expect(indexContent.data).toContain('This is my first website!');
    const errorContent = await axios.get(`http://${bucketName}.s3-website-${AWS_REGION_ID}.amazonaws.com/error.html`);
    expect(errorContent.data).toContain('This is an error!');
  });

  it('should have no resources left after teardown', async () => {
    for (const moduleId of moduleDefinitions
      .getAll()
      .map((md) => md.moduleId)
      .filter((moduleId) => moduleId !== 'account-module')) {
      moduleDefinitions.remove(moduleId);
    }

    await testModuleContainer
      .runModules(
        app,
        moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
        { outputDir, terraformTarget: 'apply' },
      )
      .next();

    const awsResourcesUtility = new AwsTagsUtility(AWS_REGION_ID);
    const leftoverArns = await awsResourcesUtility.getResourceArnsByTags(E2E_TAGS);
    expect(leftoverArns).toEqual([]);

    await expect(
      axios.get(`http://${bucketName}.s3-website-${AWS_REGION_ID}.amazonaws.com/index.html`),
    ).rejects.toThrow();
  });
});
