import { DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
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
import type { EFSClientFactory } from '../../../factories/aws-client.factory.js';
import { Efs } from '../efs.resource.js';

/**
 * @internal
 */
@Action(Efs)
export class ValidateEfsResourceAction extends ANodeAction implements IResourceAction<Efs> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof Efs &&
      hasNodeName(diff.node, 'efs') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Efs>): Promise<void> {
    // Get properties.
    const efs = diff.node;
    const properties = efs.properties;
    const response = efs.response;

    // Get instances.
    const efsClient = await this.container.get<EFSClient, typeof EFSClientFactory>(EFSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if EFS File System exists.
    const describeFileSystemsResult = await efsClient.send(
      new DescribeFileSystemsCommand({
        FileSystemId: response.FileSystemId!,
      }),
    );

    if (!describeFileSystemsResult.FileSystems || describeFileSystemsResult.FileSystems.length === 0) {
      throw new TransactionError(`EFS File System with ID ${response.FileSystemId} does not exist!`);
    }

    const actualFileSystem = describeFileSystemsResult.FileSystems[0];

    // Validate file system lifecycle state.
    if (actualFileSystem.LifeCycleState !== 'available') {
      throw new TransactionError(
        `EFS File System ${response.FileSystemId} is not in available state. Current state: ${actualFileSystem.LifeCycleState}`,
      );
    }

    // Validate file system ID.
    if (actualFileSystem.FileSystemId !== response.FileSystemId) {
      throw new TransactionError(
        `EFS File System ID mismatch. Expected: ${response.FileSystemId}, Actual: ${actualFileSystem.FileSystemId || 'undefined'}`,
      );
    }

    // Validate file system ARN.
    if (actualFileSystem.FileSystemArn !== response.FileSystemArn) {
      throw new TransactionError(
        `EFS File System ARN mismatch. Expected: ${response.FileSystemArn}, Actual: ${actualFileSystem.FileSystemArn || 'undefined'}`,
      );
    }

    // Validate ARN format (account and region should match).
    const expectedArnPrefix = `arn:aws:elasticfilesystem:${properties.awsRegionId}:${properties.awsAccountId}:file-system/`;
    if (!response.FileSystemArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `EFS File System ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.FileSystemArn}`,
      );
    }

    // Validate file system owner (AWS account).
    if (actualFileSystem.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `EFS File System account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualFileSystem.OwnerId || 'undefined'}`,
      );
    }

    // Validate performance mode.
    if (actualFileSystem.PerformanceMode !== 'generalPurpose') {
      throw new TransactionError(
        `EFS File System performance mode mismatch. Expected: generalPurpose, Actual: ${actualFileSystem.PerformanceMode || 'undefined'}`,
      );
    }

    // Validate throughput mode.
    if (actualFileSystem.ThroughputMode !== 'bursting') {
      throw new TransactionError(
        `EFS File System throughput mode mismatch. Expected: bursting, Actual: ${actualFileSystem.ThroughputMode || 'undefined'}`,
      );
    }

    // Validate encryption is disabled.
    if (actualFileSystem.Encrypted !== false) {
      throw new TransactionError(
        `EFS File System encryption mismatch. Expected: false, Actual: ${actualFileSystem.Encrypted}`,
      );
    }

    // Note: Backup setting cannot be directly validated through DescribeFileSystemsCommand.
    // AWS Backup configuration is managed separately through AWS Backup service.
    // The file system itself doesn't expose this as a direct property in the DescribeFileSystems response.
  }
}

/**
 * @internal
 */
@Factory<ValidateEfsResourceAction>(ValidateEfsResourceAction)
export class ValidateEfsResourceActionFactory {
  private static instance: ValidateEfsResourceAction;

  static async create(): Promise<ValidateEfsResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateEfsResourceAction();
    }
    return this.instance;
  }
}

