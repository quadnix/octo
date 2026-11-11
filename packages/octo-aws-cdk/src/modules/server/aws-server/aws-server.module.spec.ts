import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsLambdaFunctionAnchorSchema } from '../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsSecurityGroupAnchorSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';
import { AwsServerAccessPermission } from './index.schema.js';
import { AwsServerModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
    service: [bucket],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    service: [['test-bucket', { bucketName: 'test-bucket' }]],
  });
  const {
    service: [table],
  } = await testModuleContainer.createTestModels('tableModule', {
    app: [app],
    service: [['accounts', { tableName: 'accounts' }]],
  });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  bucket.addAnchor(
    testModuleContainer.createTestAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>(
      'AwsS3StorageServiceAccessPrefixAnchor-1234',
      { accessPrefix: 'uploads', bucketName: 'test-bucket' },
      bucket,
    ),
  );
  bucket.addAnchor(
    testModuleContainer.createTestAnchor<AwsS3StorageServiceAnchorSchema>(
      'AwsS3StorageServiceAnchor',
      { awsAccountId: '123', awsRegionId: 'us-east-1', bucketName: 'test-bucket', contentDigest: 'digest' },
      bucket,
    ),
  );

  table.addAnchor(
    testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
      'AwsDynamoDBAnchor',
      { awsAccountId: '123', awsRegionId: 'us-east-1', TableName: 'accounts' },
      table,
    ),
  );

  return { account, app };
}

async function setupLambdaFunction(
  testModuleContainer: TestModuleContainer,
  { account, app }: { account: Account; app: App },
): Promise<void> {
  const {
    execution: [execution],
  } = await testModuleContainer.createTestModels('lambdaModule', {
    account: [account],
    app: [app],
    deployment: ['v1'],
    environment: ['qa'],
    execution: [':0:0:0'],
    region: ['serverless-us-east-1'],
    server: ['billing'],
    subnet: ['default'],
  });
  const lambdaExecutionOverlayContext = '@octo/aws-lambda-execution-overlay=aws-lambda-execution-overlay-billing';
  const testOverlays = await testModuleContainer.createTestOverlays('lambdaModule', [
    { anchors: [], context: lambdaExecutionOverlayContext },
  ]);
  execution.addAnchor(
    testModuleContainer.createTestAnchor<AwsLambdaFunctionAnchorSchema>(
      'AwsLambdaFunctionAnchor',
      { awsAccountId: '999', awsRegionId: 'us-east-1', functionName: 'billing', timeoutInSeconds: 30 },
      testOverlays[lambdaExecutionOverlayContext],
    ),
  );
}

describe('AwsServerModule UT', () => {
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

  it('should create a server and its grants, none of which create resources', async () => {
    await setup(testModuleContainer);
    const { modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              dynamodb: [
                { access: AwsServerAccessPermission.READ_WRITE, service: stub('${{tableModule.model.service}}') },
              ],
              s3: [
                {
                  accessPrefixes: [{ access: AwsServerAccessPermission.READ, accessPrefix: 'uploads' }],
                  service: stub('${{testModule.model.service}}'),
                },
              ],
              serverKey: 'backend',
            },
            moduleId: 'server',
            type: AwsServerModule,
          },
          { filterByModuleIds: ['server'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CreatesNothingModelAction",
       ],
       [
         "CreatesNothingModelAction",
         "CreatesNothingModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
  });

  it('should anchor the server and its network rules', async () => {
    await setup(testModuleContainer);
    const { modelTransaction } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              securityGroupRules: [
                { CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 443, IpProtocol: 'tcp', ToPort: 443 },
                { CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 443, IpProtocol: 'tcp', ToPort: 443 },
              ],
              serverKey: 'backend',
            },
            moduleId: 'server',
            type: AwsServerModule,
          },
          { filterByModuleIds: ['server'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    const server = modelTransaction.flat().find((d) => d.field === 'serverKey')!.node as any;
    const [serverAnchor] = await server.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const [securityGroupAnchor] = await server.getAnchorsMatchingSchema(AwsSecurityGroupAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    expect(serverAnchor.getSchemaInstance().properties).toEqual({
      grants: { dynamodb: [], iamStatements: [], lambda: [], s3: [] },
      serverKey: 'backend',
    });
    expect(securityGroupAnchor.getSchemaInstance().properties).toEqual({
      rules: [{ CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 443, IpProtocol: 'tcp', ToPort: 443 }],
      securityGroupName: 'SecurityGroup-backend',
    });
  });

  it('should hold each grant on the server anchor, and join the server to the bucket or table', async () => {
    await setup(testModuleContainer);
    const { modelTransaction } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              dynamodb: [{ access: AwsServerAccessPermission.READ, service: stub('${{tableModule.model.service}}') }],
              iamStatements: [
                { actions: ['ses:SendEmail'], resources: ['arn:aws:ses:us-east-1:456:identity/example.com'] },
              ],
              s3: [
                {
                  accessPrefixes: [{ access: AwsServerAccessPermission.READ_WRITE, accessPrefix: 'uploads' }],
                  service: stub('${{testModule.model.service}}'),
                },
              ],
              serverKey: 'backend',
            },
            moduleId: 'server',
            type: AwsServerModule,
          },
          { filterByModuleIds: ['server'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    const server = modelTransaction.flat().find((d) => d.field === 'serverKey')!.node as any;
    const [serverAnchor] = await server.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    expect(serverAnchor.getSchemaInstance().properties.grants).toEqual({
      dynamodb: [{ allowRead: true, allowWrite: false, awsRegionId: 'us-east-1', tableName: 'accounts' }],
      iamStatements: [{ actions: ['ses:SendEmail'], resources: ['arn:aws:ses:us-east-1:456:identity/example.com'] }],
      lambda: [],
      s3: [{ accessPrefix: 'uploads', allowRead: true, allowWrite: true, bucketName: 'test-bucket' }],
    });

    const overlays = modelTransaction
      .flat()
      .filter((d) => d.field === 'overlayId')
      .map((d) => ({ anchors: (d.node as any).anchors.length, properties: (d.node as any).properties }));
    expect(overlays).toMatchInlineSnapshot(`
     [
       {
         "anchors": 2,
         "properties": {
           "accessPrefix": "uploads",
           "allowRead": true,
           "allowWrite": true,
           "bucketName": "test-bucket",
           "serverKey": "backend",
         },
       },
       {
         "anchors": 2,
         "properties": {
           "allowRead": true,
           "allowWrite": false,
           "awsRegionId": "us-east-1",
           "serverKey": "backend",
           "tableName": "accounts",
         },
       },
     ]
    `);
  });

  it('should merge the access of a bucket prefix or table granted more than once', async () => {
    await setup(testModuleContainer);
    const { modelTransaction } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              dynamodb: [
                { access: AwsServerAccessPermission.READ, service: stub('${{tableModule.model.service}}') },
                { access: AwsServerAccessPermission.WRITE, service: stub('${{tableModule.model.service}}') },
              ],
              s3: [
                {
                  accessPrefixes: [
                    { access: AwsServerAccessPermission.READ, accessPrefix: 'uploads' },
                    { access: AwsServerAccessPermission.WRITE, accessPrefix: 'uploads' },
                  ],
                  service: stub('${{testModule.model.service}}'),
                },
              ],
              serverKey: 'backend',
            },
            moduleId: 'server',
            type: AwsServerModule,
          },
          { filterByModuleIds: ['server'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    const server = modelTransaction.flat().find((d) => d.field === 'serverKey')!.node as any;
    const [serverAnchor] = await server.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    expect(serverAnchor.getSchemaInstance().properties.grants).toEqual({
      dynamodb: [{ allowRead: true, allowWrite: true, awsRegionId: 'us-east-1', tableName: 'accounts' }],
      iamStatements: [],
      lambda: [],
      s3: [{ accessPrefix: 'uploads', allowRead: true, allowWrite: true, bucketName: 'test-bucket' }],
    });
    expect(modelTransaction.flat().filter((d) => d.field === 'overlayId')).toHaveLength(2);
  });

  it('should grant a function granted more than once only once', async () => {
    await setupLambdaFunction(testModuleContainer, await setup(testModuleContainer));
    const { modelTransaction } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              lambda: [
                { execution: stub('${{lambdaModule.model.execution}}') },
                { execution: stub('${{lambdaModule.model.execution}}') },
              ],
              serverKey: 'backend',
            },
            moduleId: 'server',
            type: AwsServerModule,
          },
          { filterByModuleIds: ['server'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    const server = modelTransaction.flat().find((d) => d.field === 'serverKey')!.node as any;
    const [serverAnchor] = await server.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    expect(serverAnchor.getSchemaInstance().properties.grants.lambda).toEqual([
      { awsAccountId: '999', awsRegionId: 'us-east-1', functionName: 'billing' },
    ]);
    expect(
      modelTransaction
        .flat()
        .filter((d) => d.field === 'overlayId')
        .map((d) => (d.node as any).properties),
    ).toEqual([{ awsAccountId: '999', awsRegionId: 'us-east-1', functionName: 'billing', serverKey: 'backend' }]);
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsServerModule>(
        {
          inputs: { account: stub('${{testModule.model.account}}'), serverKey: 'backend' },
          moduleId: 'server-1',
          type: AwsServerModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: { account: stub('${{testModule.model.account}}'), serverKey: 'backend' },
            moduleId: 'server-2',
            type: AwsServerModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
  });

  describe('validation', () => {
    it('should reject an unknown access', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsServerModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                dynamodb: [
                  { access: 'READWRITE' as AwsServerAccessPermission, service: stub('${{tableModule.model.service}}') },
                ],

                serverKey: 'backend',
              },
              moduleId: 'server',
              type: AwsServerModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrow('Property "dynamodb" in schema could not be validated!');
    });

    it('should reject an access prefix the bucket does not declare', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsServerModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                s3: [
                  {
                    accessPrefixes: [{ access: AwsServerAccessPermission.READ, accessPrefix: 'downloads' }],
                    service: stub('${{testModule.model.service}}'),
                  },
                ],
                serverKey: 'backend',
              },
              moduleId: 'server',
              type: AwsServerModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrow('Cannot find access prefix in S3Storage service!');
    });

    it.each([
      ['no actions', { actions: [], resources: ['arn:aws:ses:us-east-1:456:identity/example.com'] }],
      ['an empty action', { actions: [''], resources: ['arn:aws:ses:us-east-1:456:identity/example.com'] }],
      ['no resources', { actions: ['ses:SendEmail'], resources: [] }],
      ['an empty resource', { actions: ['ses:SendEmail'], resources: [''] }],
    ])('should reject an IAM statement with %s', async (_name, statement) => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsServerModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                iamStatements: [statement],
                serverKey: 'backend',
              },
              moduleId: 'server',
              type: AwsServerModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrow('Property "iamStatements" in schema could not be validated!');
    });
  });
});
