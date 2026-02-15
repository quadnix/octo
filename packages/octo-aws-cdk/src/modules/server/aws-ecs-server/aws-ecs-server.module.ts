import { AModule, type Account, AccountType, type App, Module, ModuleError } from '@quadnix/octo';
import { AwsEcsServerAnchor } from '../../../anchors/aws-ecs/aws-ecs-server.anchor.js';
import { AwsIamRoleAnchor } from '../../../anchors/aws-iam/aws-iam-role.anchor.js';
import { AwsS3StorageServiceDirectoryAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-directory.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsSecurityGroupAnchor } from '../../../anchors/aws-security-group/aws-security-group.anchor.js';
import { CommonUtility } from '../../../utilities/common/common.utility.js';
import { AwsEcsServerModuleSchema, AwsEcsServerS3AccessDirectoryPermission } from './index.schema.js';
import { AwsEcsServer } from './models/server/index.js';
import { AwsEcsServerS3AccessOverlay } from './overlays/aws-ecs-server-s3-access/index.js';

/**
 * `AwsEcsServerModule` is an ECS-based AWS server module that provides an implementation for the `Server` model.
 * This module creates servers with ECS deployment capabilities,
 * IAM roles, security groups, and optional S3 storage access.
 * It manages the infrastructure foundation for hosting containerized applications.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEcsServerModule } from '@quadnix/octo-aws-cdk/modules/server/aws-ecs-server';
 *
 * octo.loadModule(AwsEcsServerModule, 'my-server-module', {
 *   account: myAccount,
 *   s3: [{
 *     directories: [{
 *       access: S3StorageAccess.READ_WRITE,
 *       remoteDirectoryPath: 'uploads',
 *     }],
 *     service: myS3Service,
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
 * @group Modules/Server/AwsEcsServer
 *
 * @reference Resources {@link IamRoleSchema}
 * @reference Resources {@link S3StorageSchema}
 *
 * @see {@link AwsEcsServerModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Server} to learn more about the `Server` model.
 */
@Module<AwsEcsServerModule>('@octo', AwsEcsServerModuleSchema)
export class AwsEcsServerModule extends AModule<AwsEcsServerModuleSchema, AwsEcsServer> {
  async onInit(inputs: AwsEcsServerModuleSchema): Promise<(AwsEcsServer | AwsEcsServerS3AccessOverlay)[]> {
    const models: (AwsEcsServer | AwsEcsServerS3AccessOverlay)[] = [];
    const { account, app, iamRoleName } = await this.registerMetadata(inputs);

    // Create a new server.
    const server = new AwsEcsServer(inputs.serverKey);
    app.addServer(server);
    models.push(server);

    // Add anchors.
    server.addAnchor(
      new AwsEcsServerAnchor('AwsEcsServerAnchor', { deploymentType: 'ecs', serverKey: server.serverKey }, server),
    );
    const iamRoleAnchor = new AwsIamRoleAnchor('AwsIamRoleAnchor', { iamRoleName }, server);
    server.addAnchor(iamRoleAnchor);
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

    const awsRegionIds: string[] = [];
    if (inputs.s3) {
      for (const s3 of inputs.s3 || []) {
        const service = s3.service;
        const [matchingS3StorageAnchor] = await service.getAnchorsMatchingSchema(AwsS3StorageServiceAnchorSchema, [], {
          searchBoundaryMembers: false,
        });

        if (matchingS3StorageAnchor.getSchemaInstance().properties.awsAccountId !== account.accountId) {
          throw new ModuleError(
            'This module does not support adding s3 resources from other accounts!',
            this.constructor.name,
          );
        }

        const awsRegionId = matchingS3StorageAnchor.getSchemaInstance().properties.awsRegionId;
        if (awsRegionIds.indexOf(awsRegionId) === -1) {
          awsRegionIds.push(awsRegionId);
        }

        for (const directory of s3.directories) {
          const allowRead =
            directory.access === AwsEcsServerS3AccessDirectoryPermission.READ ||
            directory.access === AwsEcsServerS3AccessDirectoryPermission.READ_WRITE;
          const allowWrite =
            directory.access === AwsEcsServerS3AccessDirectoryPermission.WRITE ||
            directory.access === AwsEcsServerS3AccessDirectoryPermission.READ_WRITE;
          if (!allowRead && !allowWrite) {
            continue;
          }

          const matchingAnchors = await service.getAnchorsMatchingSchema(
            AwsS3StorageServiceDirectoryAnchorSchema,
            [{ key: 'remoteDirectoryPath', value: directory.remoteDirectoryPath }],
            { searchBoundaryMembers: false },
          );
          if (matchingAnchors.length !== 1) {
            throw new ModuleError('Cannot find remote directory in S3Storage service!', this.constructor.name);
          }
          const s3DirectoryAnchor = matchingAnchors[0];

          const overlayIdSuffix = CommonUtility.hash(
            iamRoleAnchor.anchorId,
            directory.remoteDirectoryPath,
            directory.access,
          ).substring(0, 12);
          const overlayId = `aws-ecs-server-s3-access-overlay-${overlayIdSuffix}`;
          const serverS3AccessOverlay = new AwsEcsServerS3AccessOverlay(
            overlayId,
            {
              allowRead,
              allowWrite,
              bucketName: s3DirectoryAnchor.getSchemaInstance().properties.bucketName,
              iamRoleName: iamRoleAnchor.properties.iamRoleName,
              iamRolePolicyId: overlayId,
              remoteDirectoryPath: directory.remoteDirectoryPath,
            },
            [iamRoleAnchor, s3DirectoryAnchor],
          );
          models.push(serverS3AccessOverlay);
        }
      }
    }

    return models;
  }

  override async registerMetadata(
    inputs: AwsEcsServerModuleSchema,
  ): Promise<{ account: Account; app: App; iamRoleName: string }> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new ModuleError('Only AWS accounts are supported in this module!', this.constructor.name);
    }
    const app = account.getParents()['app'][0].to as App;

    return {
      account,
      app,
      iamRoleName: `ServerRole-${inputs.serverKey}`,
    };
  }
}
