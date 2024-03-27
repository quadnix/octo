import {
  CreateServiceCommand,
  DeleteTaskDefinitionsCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
} from '@aws-sdk/client-ecs';
import { jest } from '@jest/globals';
import {
  App,
  Container,
  DiffMetadata,
  Environment,
  Execution,
  Image,
  LocalStateProvider,
  TestContainer,
} from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsDeployment, AwsRegion, AwsServer, EcrService, OctoAws, RegionId, S3StorageService } from '../../index.js';
import { ProcessUtility } from '../../utilities/process/process.utility.js';
import { RetryUtility } from '../../utilities/retry/retry.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Execution UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  let retryPromiseMock: jest.MockedFunction<any>;
  let runDetachedProcessMock: jest.MockedFunction<any>;

  beforeAll(() => {
    TestContainer.create(
      [
        {
          type: ECSClient,
          value: { send: jest.fn() },
        },
      ],
      { factoryTimeoutInMs: 500 },
    );

    retryPromiseMock = jest.spyOn(RetryUtility, 'retryPromise');
    runDetachedProcessMock = jest.spyOn(ProcessUtility, 'runDetachedProcess');
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  it('should test e2e', async () => {
    (retryPromiseMock as jest.Mock).mockResolvedValue(undefined as never);
    runDetachedProcessMock.mockReturnValue({
      on: jest.fn().mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'exit') {
          cb(0);
        }
      }),
      removeAllListeners: jest.fn(),
    });

    const ecsClient = await Container.get(ECSClient);
    (ecsClient.send as jest.Mock).mockImplementation(async (instance) => {
      if (instance instanceof RegisterTaskDefinitionCommand) {
        return { taskDefinition: { revision: 1, taskDefinitionArn: 'taskDefinitionArn' } };
      } else if (instance instanceof CreateServiceCommand) {
        return { service: { serviceArn: 'serviceArn' } };
      } else if (instance instanceof DeleteTaskDefinitionsCommand) {
        return { failures: [] };
      }
    });

    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));
    octoAws.registerInputs({
      'input.ecs.aws-us-east-1a-qa.service-backend.desiredCount': '1',
      'input.image.image:0.0.1.command': 'npm start',
      'input.image.image:0.0.1.dockerExecutable': 'docker',
      'input.image.image:0.0.1.ports': '8080',
      'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
      'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
      'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      'input.server.backend.deployment.0.0.1.deploymentFolderLocalPath': __dirname,
    });

    const app = new App('test');
    const image = new Image('image', '0.0.1', {
      dockerfilePath: '/Dockerfile',
    });
    app.addImage(image);
    const ecrService = new EcrService('image');
    ecrService.addRegion(RegionId.AWS_US_EAST_1A);
    ecrService.addImage(image);
    app.addService(ecrService);
    const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
    app.addRegion(region);
    const environment = new Environment('qa');
    region.addEnvironment(environment);
    const server = new AwsServer('backend', image);
    app.addServer(server);
    const service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
    app.addService(service);
    const deployment = new AwsDeployment('0.0.1', service);
    server.addDeployment(deployment);

    const diffs0 = await octoAws.diff(app);
    const generator0 = await octoAws.beginTransaction(diffs0, {
      yieldModelTransaction: true,
    });

    // Prevent generator from running real resource actions.
    const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult0.value);

    const execution = new Execution(deployment, environment, image);

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult1 = await generator1.next();
    const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult1.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult1.value).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "add",
            "field": "resourceId",
            "value": "ecs-task-definition-backend",
          },
        ],
        [
          {
            "action": "add",
            "field": "resourceId",
            "value": "ecs-service-backend",
          },
        ],
      ]
    `);

    // Remove execution.
    execution.remove(true);

    const diffs2 = await octoAws.diff(app);
    const generator2 = await octoAws.beginTransaction(diffs2, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult2 = await generator2.next();
    const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult2.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult2.value).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "delete",
            "field": "resourceId",
            "value": "ecs-service-backend",
          },
        ],
        [
          {
            "action": "delete",
            "field": "resourceId",
            "value": "ecs-task-definition-backend",
          },
        ],
      ]
    `);
  });
});
