import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import {
  type App,
  type ResourceSerializedOutput,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-localstack-account';
import { type AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteSourcePath = join(__dirname, 'website');

jest.setTimeout(30_000);

describe('Main IT', () => {
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
    moduleDefinitions = new ModuleDefinitions();
    // Replace real aws credentials with localstack.
    moduleDefinitions.update(AwsLocalstackAccountModule, 'account-module', {
      app: stub<App>('${{app-module.model.app}}'),
    });

    await TestContainer.create(
      { mocks: [{ type: ModuleDefinitions, value: moduleDefinitions }] },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(stateProvider);

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

  it('should create base resources', async () => {
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );

    const { resourceTransaction } = await testModuleContainer.commit(app);
    expect(resourceTransaction).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/s3-website=bucket-${bucketNameNormalized}",
           "value": "@octo/s3-website=bucket-${bucketNameNormalized}",
         },
       ],
       [
         {
           "action": "update",
           "field": "update-source-paths",
           "node": "@octo/s3-website=bucket-${bucketNameNormalized}",
           "value": {
             "error.html": [
               "add",
               "${websiteSourcePath}/error.html",
             ],
             "index.html": [
               "add",
               "${websiteSourcePath}/index.html",
             ],
           },
         },
       ],
     ]
    `);

    const resourcesActualState = await stateProvider.getState('resources-actual.json');
    const resourcesActual: { data: ResourceSerializedOutput } = JSON.parse(resourcesActualState.toString('utf-8'));

    // s3-website exists.
    expect(resourcesActual.data.resources[`@octo/s3-website=bucket-${bucketNameNormalized}`]).toMatchInlineSnapshot(`
     {
       "className": "@octo/S3Website",
       "resource": {
         "parents": [],
         "properties": {
           "Bucket": "${bucketName}",
           "ErrorDocument": "error.html",
           "IndexDocument": "index.html",
           "awsAccountId": "000000000000",
           "awsRegionId": "us-east-1",
         },
         "resourceId": "bucket-${bucketNameNormalized}",
         "response": {
           "Arn": "arn:aws:s3:::${bucketName}",
           "awsRegionId": "us-east-1",
         },
         "tags": {},
       },
     }
    `);
  });

  it('should delete s3-website resource', async () => {
    moduleDefinitions.remove('s3-website-service-module');
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );

    const { resourceTransaction } = await testModuleContainer.commit(app);
    expect(resourceTransaction).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/s3-website=bucket-${bucketNameNormalized}",
           "value": "@octo/s3-website=bucket-${bucketNameNormalized}",
         },
       ],
     ]
    `);

    const resourcesActualState = await stateProvider.getState('resources-actual.json');
    const resourcesActual: { data: ResourceSerializedOutput } = JSON.parse(resourcesActualState.toString('utf-8'));

    // s3-website deleted.
    expect(resourcesActual.data.resources[`@octo/s3-website=bucket-${bucketNameNormalized}`]).toBeUndefined();
  });
});
