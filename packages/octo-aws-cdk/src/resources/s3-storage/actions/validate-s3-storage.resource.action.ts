import { GetBucketPolicyCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import { S3Storage } from '../s3-storage.resource.js';

/**
 * @internal
 */
@Action(S3Storage)
export class ValidateS3StorageResourceAction extends ANodeAction implements IResourceAction<S3Storage> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof S3Storage &&
      hasNodeName(diff.node, 's3-storage') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Storage>): Promise<void> {
    // Get properties.
    const s3Storage = diff.node;
    const properties = s3Storage.properties;
    const response = s3Storage.response;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if bucket exists.
    try {
      await s3Client.send(
        new HeadBucketCommand({
          Bucket: properties.Bucket,
        }),
      );
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw new TransactionError(`S3 bucket ${properties.Bucket} does not exist!`);
      }
      throw error;
    }

    // Validate bucket ARN format.
    const expectedArn = `arn:aws:s3:::${properties.Bucket}`;
    if (response.Arn !== expectedArn) {
      throw new TransactionError(
        `S3 bucket ARN mismatch. Expected: ${expectedArn}, Actual: ${response.Arn || 'undefined'}`,
      );
    }

    // Validate bucket policy if permissions exist.
    if (properties.permissions.length > 0) {
      try {
        const bucketPolicy = await s3Client.send(
          new GetBucketPolicyCommand({
            Bucket: properties.Bucket,
          }),
        );

        if (!bucketPolicy.Policy) {
          throw new TransactionError(
            `S3 bucket ${properties.Bucket} does not have a bucket policy, but permissions are configured!`,
          );
        }

        const policy = JSON.parse(bucketPolicy.Policy);

        // Validate policy version.
        if (policy.Version !== '2012-10-17') {
          throw new TransactionError(`S3 bucket policy version mismatch. Expected: 2012-10-17, Actual: ${policy.Version}`);
        }

        // Validate each permission has corresponding policy statements.
        for (const permission of properties.permissions) {
          const principalArn = s3Storage.parents
            .find((p) => p.getActual().resourceId === permission.principalResourceId)!
            .getSchemaInstanceInResourceAction().response.Arn;

          // Validate read permission statement.
          if (permission.allowRead) {
            const readSid = PolicyUtility.getSafeSid(`${permission.principalResourceId}-ReadPermission`);
            const readStatement = policy.Statement?.find((statement: any) => statement.Sid === readSid);

            if (!readStatement) {
              throw new TransactionError(
                `S3 bucket policy missing read permission statement with Sid: ${readSid} for principal ${permission.principalResourceId}`,
              );
            }

            // Validate read statement properties.
            if (readStatement.Effect !== 'Allow') {
              throw new TransactionError(`Read permission statement ${readSid} has incorrect Effect: ${readStatement.Effect}`);
            }

            if (JSON.stringify(readStatement.Action) !== JSON.stringify(['s3:GetObject'])) {
              throw new TransactionError(
                `Read permission statement ${readSid} has incorrect Action: ${JSON.stringify(readStatement.Action)}`,
              );
            }

            const expectedPrincipal = { AWS: [principalArn] };
            if (JSON.stringify(readStatement.Principal) !== JSON.stringify(expectedPrincipal)) {
              throw new TransactionError(
                `Read permission statement ${readSid} has incorrect Principal: ${JSON.stringify(readStatement.Principal)}`,
              );
            }

            const expectedResource = [
              `arn:aws:s3:::${properties.Bucket}/${permission.remoteDirectoryPath}`,
              `arn:aws:s3:::${properties.Bucket}/${permission.remoteDirectoryPath}/*`,
            ];
            if (JSON.stringify(readStatement.Resource) !== JSON.stringify(expectedResource)) {
              throw new TransactionError(
                `Read permission statement ${readSid} has incorrect Resource: ${JSON.stringify(readStatement.Resource)}`,
              );
            }
          }

          // Validate write permission statement.
          if (permission.allowWrite) {
            const writeSid = PolicyUtility.getSafeSid(`${permission.principalResourceId}-WritePermission`);
            const writeStatement = policy.Statement?.find((statement: any) => statement.Sid === writeSid);

            if (!writeStatement) {
              throw new TransactionError(
                `S3 bucket policy missing write permission statement with Sid: ${writeSid} for principal ${permission.principalResourceId}`,
              );
            }

            // Validate write statement properties.
            if (writeStatement.Effect !== 'Allow') {
              throw new TransactionError(`Write permission statement ${writeSid} has incorrect Effect: ${writeStatement.Effect}`);
            }

            if (JSON.stringify(writeStatement.Action) !== JSON.stringify(['s3:PutObject'])) {
              throw new TransactionError(
                `Write permission statement ${writeSid} has incorrect Action: ${JSON.stringify(writeStatement.Action)}`,
              );
            }

            const expectedPrincipal = { AWS: [principalArn] };
            if (JSON.stringify(writeStatement.Principal) !== JSON.stringify(expectedPrincipal)) {
              throw new TransactionError(
                `Write permission statement ${writeSid} has incorrect Principal: ${JSON.stringify(writeStatement.Principal)}`,
              );
            }

            const expectedResource = [
              `arn:aws:s3:::${properties.Bucket}/${permission.remoteDirectoryPath}`,
              `arn:aws:s3:::${properties.Bucket}/${permission.remoteDirectoryPath}/*`,
            ];
            if (JSON.stringify(writeStatement.Resource) !== JSON.stringify(expectedResource)) {
              throw new TransactionError(
                `Write permission statement ${writeSid} has incorrect Resource: ${JSON.stringify(writeStatement.Resource)}`,
              );
            }
          }
        }

        // Validate no extra policy statements exist beyond expected ones.
        const expectedStatementCount = properties.permissions.reduce((count, permission) => {
          return count + (permission.allowRead ? 1 : 0) + (permission.allowWrite ? 1 : 0);
        }, 0);

        if (policy.Statement?.length !== expectedStatementCount) {
          throw new TransactionError(
            `S3 bucket policy has unexpected number of statements. Expected: ${expectedStatementCount}, Actual: ${policy.Statement?.length || 0}`,
          );
        }
      } catch (error: any) {
        if (error.name === 'NoSuchBucketPolicy') {
          throw new TransactionError(
            `S3 bucket ${properties.Bucket} does not have a bucket policy, but permissions are configured!`,
          );
        }
        throw error;
      }
    } else {
      // If no permissions are configured, verify no bucket policy exists.
      try {
        const bucketPolicy = await s3Client.send(
          new GetBucketPolicyCommand({
            Bucket: properties.Bucket,
          }),
        );

        if (bucketPolicy.Policy) {
          throw new TransactionError(
            `S3 bucket ${properties.Bucket} has a bucket policy, but no permissions are configured!`,
          );
        }
      } catch (error: any) {
        if (error.name === 'NoSuchBucketPolicy') {
          // This is expected when no permissions are configured.
          return;
        }
        throw error;
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateS3StorageResourceAction>(ValidateS3StorageResourceAction)
export class ValidateS3StorageResourceActionFactory {
  private static instance: ValidateS3StorageResourceAction;

  static async create(): Promise<ValidateS3StorageResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateS3StorageResourceAction();
    }
    return this.instance;
  }
}

