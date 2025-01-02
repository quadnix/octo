import { IAMClient } from '@aws-sdk/client-iam';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Container,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddIamRoleResourceAction } from '../../../resources/iam-role/actions/add-iam-role.resource.action.js';
import type { IamRole } from '../../../resources/iam-role/index.js';
import { AwsServerModule } from './aws-server.module.js';
import { AddServerModelAction } from './models/server/actions/add-server.model.action.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,account'],
    app: ['test-app'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  return { account, app };
}

describe('AwsServerModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsRegionId: 'us-east-1', package: '@octo' },
            type: IAMClient,
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
    testModuleContainer.registerCapture<IamRole>('@octo/iam-role=iam-role-ServerRole-backend', {
      Arn: 'Arn',
      policies: {
        AmazonECSTaskExecutionRolePolicy: ['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'],
        AmazonECSTasksAssumeRolePolicy: ['ecs-tasks.amazonaws.com'],
      },
      RoleId: 'RoleId',
      RoleName: 'RoleName',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addServerModelAction = await container.get(AddServerModelAction);
    const addServerModelActionSpy = jest.spyOn(addServerModelAction, 'handle');
    const addIamRoleResourceAction = await container.get(AddIamRoleResourceAction);
    const addIamRoleResourceActionSpy = jest.spyOn(addIamRoleResourceAction, 'handle');

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsServerModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addServerModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addServerModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "account": {
           "accountId": "account",
           "accountType": "aws",
           "context": "account=account,app=test-app",
         },
         "securityGroupRules": [],
         "serverKey": "backend",
       },
       "models": {
         "server": {
           "context": "server=backend,app=test-app",
           "serverKey": "backend",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);

    expect(addIamRoleResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addIamRoleResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/iam-role=iam-role-ServerRole-backend",
       "value": "@octo/iam-role=iam-role-ServerRole-backend",
     }
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsServerModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
       ],
       [],
     ]
    `);

    // Adding security groups should have no effect as they are not created until execution.
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        securityGroupRules: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            FromPort: 0,
            IpProtocol: 'tcp',
            ToPort: 65535,
          },
        ],
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsServerModule,
    });

    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
       ],
       [],
     ]
    `);
  });
});
