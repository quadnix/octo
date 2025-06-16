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
import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/localstack-based-aws-account';
import { type AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/s3-static-website-aws-service';
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteSourcePath = join(__dirname, 'website');

jest.setTimeout(30_000);

describe('Main IT', () => {
  let bucketName: string;
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
           "node": "@octo/s3-website=bucket-octo-test",
           "value": "@octo/s3-website=bucket-octo-test",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-aws-us-east-1a",
           "value": "@octo/vpc=vpc-aws-us-east-1a",
         },
       ],
       [
         {
           "action": "update",
           "field": "update-source-paths",
           "node": "@octo/s3-website=bucket-octo-test",
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
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-aws-us-east-1a",
           "value": "@octo/internet-gateway=igw-aws-us-east-1a",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-aws-us-east-1a-access",
           "value": "@octo/security-group=sec-grp-aws-us-east-1a-access",
         },
       ],
     ]
    `);

    const resourcesActualState = await stateProvider.getState('resources-actual.json');
    const resourcesActual: { data: ResourceSerializedOutput } = JSON.parse(resourcesActualState.toString('utf-8'));

    // s3-website exists.
    expect(resourcesActual.data.resources[`@octo/s3-website=bucket-${bucketName}`]).toMatchInlineSnapshot(`
     {
       "className": "@octo/S3Website",
       "resource": {
         "parents": [],
         "properties": {
           "Bucket": "octo-test",
           "ErrorDocument": "error.html",
           "IndexDocument": "index.html",
           "awsAccountId": "000000000000",
           "awsRegionId": "us-east-1",
         },
         "resourceId": "bucket-${bucketName}",
         "response": {
           "awsRegionId": "us-east-1",
         },
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
           "node": "@octo/s3-website=bucket-${bucketName}",
           "value": "@octo/s3-website=bucket-${bucketName}",
         },
       ],
     ]
    `);

    const resourcesActualState = await stateProvider.getState('resources-actual.json');
    const resourcesActual: { data: ResourceSerializedOutput } = JSON.parse(resourcesActualState.toString('utf-8'));

    // s3-website deleted.
    expect(resourcesActual.data.resources[`@octo/s3-website=bucket-${bucketName}`]).toBeUndefined();
  });
});
