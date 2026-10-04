import {
  AModule,
  type Account,
  AccountType,
  type App,
  type MatchingAnchor,
  Module,
  ModuleError,
  StringUtility,
} from '@quadnix/octo';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import { AwsSecurityGroupAnchor } from '../../../anchors/aws-security-group/aws-security-group.anchor.js';
import { AwsServerAnchor } from '../../../anchors/aws-server/aws-server.anchor.js';
import { AwsServerAccessPermission, AwsServerModuleSchema } from './index.schema.js';
import { AwsServer } from './models/server/index.js';
import { AwsServerDynamoDBAccessOverlay } from './overlays/aws-server-dynamodb-access/index.js';
import { AwsServerS3AccessOverlay } from './overlays/aws-server-s3-access/index.js';

/**
 * `AwsServerModule` is an AWS server module that provides an implementation for the `Server` model.
 * A server is the identity of some code: what it may reach, and its network rules. It creates nothing
 * and knows nothing about where the code runs. The execution that runs the code, on ECS or on Lambda,
 * reads the server and creates everything its runtime needs, including the IAM role holding these grants.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Account, type Service, stub } from '@quadnix/octo';
 * import { AwsServerModule } from '@quadnix/octo-aws-cdk/modules/server/aws-server';
 * import { AwsServerAccessPermission } from '@quadnix/octo-aws-cdk/modules/server/aws-server/schema';
 *
 * octo.loadModule(AwsServerModule, 'my-server-module', {
 *   account: stub<Account>('${{my-account-module.model.account}}'),
 *   dynamodb: [{
 *     access: AwsServerAccessPermission.READ_WRITE,
 *     service: stub<Service>('${{my-table-module.model.service}}'),
 *   }],
 *   s3: [{
 *     accessPrefixes: [{
 *       access: AwsServerAccessPermission.READ_WRITE,
 *       accessPrefix: 'uploads',
 *     }],
 *     service: stub<Service>('${{my-storage-module.model.service}}'),
 *   }],
 *   securityGroupRules: [{
 *     CidrBlock: '0.0.0.0/0',
 *     Egress: false,
 *     FromPort: 443,
 *     ToPort: 443,
 *     IpProtocol: 'tcp'
 *   }],
 *   serverKey: 'backend-server',
 * });
 * ```
 *
 * @group Modules/Server/AwsServer
 *
 * @see {@link AwsServerModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Server](/api/octo/class/Server) to learn more about the `Server` model.
 */
@Module<AwsServerModule>('@octo', AwsServerModuleSchema)
export class AwsServerModule extends AModule<AwsServerModuleSchema, AwsServer> {
  /**
   * Creates the server, and anchors what it may reach. Each bucket prefix and table it may reach is also
   * joined to the server by a grant overlay, which creates nothing. A prefix or table granted more than
   * once is granted once, with the access of all its grants.
   */
  async onInit(
    inputs: AwsServerModuleSchema,
  ): Promise<(AwsServer | AwsServerDynamoDBAccessOverlay | AwsServerS3AccessOverlay)[]> {
    const models: (AwsServer | AwsServerDynamoDBAccessOverlay | AwsServerS3AccessOverlay)[] = [];
    const { app } = await this.registerMetadata(inputs);

    // Create a new server.
    const server = new AwsServer(inputs.serverKey);
    app.addServer(server);
    models.push(server);

    // Add anchors.
    const serverAnchor = new AwsServerAnchor(
      'AwsServerAnchor',
      { grants: { dynamodb: [], s3: [] }, serverKey: server.serverKey },
      server,
    );
    server.addAnchor(serverAnchor);
    const securityGroupAnchor = new AwsSecurityGroupAnchor(
      'AwsSecurityGroupAnchor',
      { rules: [], securityGroupName: `SecurityGroup-${inputs.serverKey}` },
      server,
    );
    server.addAnchor(securityGroupAnchor);

    // Add aws-security-group rules.
    for (const rule of inputs.securityGroupRules || []) {
      const existingRule = securityGroupAnchor.properties.rules.find(
        (r) =>
          r.CidrBlock === rule.CidrBlock &&
          r.Egress === rule.Egress &&
          r.FromPort === rule.FromPort &&
          r.IpProtocol === rule.IpProtocol &&
          r.ToPort === rule.ToPort,
      );
      if (!existingRule) {
        securityGroupAnchor.properties.rules.push(rule);
      }
    }

    // Collect the S3 grants, one per bucket prefix. Granting a prefix more than once merges the access,
    // because the execution names the role's policy by bucket and prefix, and a second grant would replace it.
    const s3Grants = new Map<
      string,
      {
        allowRead: boolean;
        allowWrite: boolean;
        anchor: MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>;
      }
    >();
    for (const s3 of inputs.s3 || []) {
      const service = s3.service;
      for (const grant of s3.accessPrefixes) {
        const matchingAnchors = await service.getAnchorsMatchingSchema(
          AwsS3StorageServiceAccessPrefixAnchorSchema,
          [{ key: 'accessPrefix', value: grant.accessPrefix }],
          { searchBoundaryMembers: false },
        );
        if (matchingAnchors.length !== 1) {
          throw new ModuleError('Cannot find access prefix in S3Storage service!', this.constructor.name);
        }
        const s3AccessPrefixAnchor = matchingAnchors[0];
        const bucketName = s3AccessPrefixAnchor.getSchemaInstance().properties.bucketName;

        const { allowRead, allowWrite } = this.getAccess(grant.access);
        const key = JSON.stringify([bucketName, grant.accessPrefix]);
        const existingGrant = s3Grants.get(key);
        s3Grants.set(key, {
          allowRead: allowRead || !!existingGrant?.allowRead,
          allowWrite: allowWrite || !!existingGrant?.allowWrite,
          anchor: s3AccessPrefixAnchor,
        });
      }
    }

    // Add one grant overlay per S3 bucket prefix.
    for (const { allowRead, allowWrite, anchor } of s3Grants.values()) {
      const { accessPrefix, bucketName } = anchor.getSchemaInstance().properties;

      // The bucket is part of what defines this grant. Without it, one server given the same
      // access prefix in two buckets derives the same overlay ID twice.
      const overlayIdSuffix = StringUtility.deterministicHash([server.serverKey, bucketName, accessPrefix]).substring(
        0,
        12,
      );
      serverAnchor.properties.grants.s3.push({ accessPrefix, allowRead, allowWrite, bucketName });
      models.push(
        new AwsServerS3AccessOverlay(
          `aws-server-s3-access-overlay-${overlayIdSuffix}`,
          { accessPrefix, allowRead, allowWrite, bucketName, serverKey: server.serverKey },
          [serverAnchor, anchor],
        ),
      );
    }

    // Collect the DynamoDB grants, one per table, merging the access of a table granted more than once.
    // A table is named by its region and name, since two regions may each hold a table of one name.
    const dynamodbGrants = new Map<
      string,
      { allowRead: boolean; allowWrite: boolean; anchor: MatchingAnchor<AwsDynamoDBAnchorSchema> }
    >();
    for (const grant of inputs.dynamodb || []) {
      const [matchingDynamoDBAnchor] = await grant.service.getAnchorsMatchingSchema(AwsDynamoDBAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const { awsRegionId, TableName: tableName } = matchingDynamoDBAnchor.getSchemaInstance().properties;

      const { allowRead, allowWrite } = this.getAccess(grant.access);
      const key = JSON.stringify([awsRegionId, tableName]);
      const existingGrant = dynamodbGrants.get(key);
      dynamodbGrants.set(key, {
        allowRead: allowRead || !!existingGrant?.allowRead,
        allowWrite: allowWrite || !!existingGrant?.allowWrite,
        anchor: matchingDynamoDBAnchor,
      });
    }

    // Add one grant overlay per DynamoDB table.
    for (const { allowRead, allowWrite, anchor } of dynamodbGrants.values()) {
      const { awsRegionId, TableName: tableName } = anchor.getSchemaInstance().properties;

      const overlayIdSuffix = StringUtility.deterministicHash([server.serverKey, awsRegionId, tableName]).substring(
        0,
        12,
      );
      serverAnchor.properties.grants.dynamodb.push({ allowRead, allowWrite, awsRegionId, tableName });
      models.push(
        new AwsServerDynamoDBAccessOverlay(
          `aws-server-dynamodb-access-overlay-${overlayIdSuffix}`,
          { allowRead, allowWrite, awsRegionId, serverKey: server.serverKey, tableName },
          [serverAnchor, anchor],
        ),
      );
    }

    return models;
  }

  /**
   * Resolves the account and the app this server belongs to.
   */
  override async registerMetadata(inputs: AwsServerModuleSchema): Promise<{ account: Account; app: App }> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new ModuleError('Only AWS accounts are supported in this module!', this.constructor.name);
    }
    const app = account.getParents()['app'][0].to as App;

    return { account, app };
  }

  /**
   * Splits a permission into whether it reads and whether it writes.
   */
  private getAccess(access: AwsServerAccessPermission): { allowRead: boolean; allowWrite: boolean } {
    return {
      allowRead: access === AwsServerAccessPermission.READ || access === AwsServerAccessPermission.READ_WRITE,
      allowWrite: access === AwsServerAccessPermission.WRITE || access === AwsServerAccessPermission.READ_WRITE,
    };
  }
}
