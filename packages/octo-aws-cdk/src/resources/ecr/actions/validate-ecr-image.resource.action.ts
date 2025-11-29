import { DescribeRepositoriesCommand, type DescribeRepositoriesCommandOutput, ECRClient } from '@aws-sdk/client-ecr';
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
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { EcrImage } from '../ecr-image.resource.js';

/**
 * @internal
 */
@Action(EcrImage)
export class ValidateEcrImageResourceAction extends ANodeAction implements IResourceAction<EcrImage> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof EcrImage &&
      hasNodeName(diff.node, 'ecr-image') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcrImage>): Promise<void> {
    // Get properties.
    const ecrImage = diff.node;
    const properties = ecrImage.properties;
    const response = ecrImage.response;

    // Get instances.
    const ecrClient = await this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if ECR Repository exists.
    let describeRepositoriesResult: DescribeRepositoriesCommandOutput | undefined;
    try {
      describeRepositoriesResult = await ecrClient.send(
        new DescribeRepositoriesCommand({
          repositoryNames: [response.repositoryName!],
        }),
      );
    } catch (error: any) {
      if (error.name === 'RepositoryNotFoundException') {
        throw new TransactionError(`ECR Repository with name ${response.repositoryName} does not exist!`);
      }
      throw error;
    }

    if (!describeRepositoriesResult.repositories || describeRepositoriesResult.repositories.length === 0) {
      throw new TransactionError(`ECR Repository with name ${response.repositoryName} does not exist!`);
    }

    const actualRepository = describeRepositoriesResult.repositories[0];

    // Validate repository name.
    if (actualRepository.repositoryName !== response.repositoryName) {
      throw new TransactionError(
        `ECR Repository name mismatch. Expected: ${response.repositoryName}, Actual: ${actualRepository.repositoryName || 'undefined'}`,
      );
    }

    // Validate repository name matches imageId property.
    if (actualRepository.repositoryName !== properties.imageId) {
      throw new TransactionError(
        `ECR Repository name does not match imageId. Expected: ${properties.imageId}, Actual: ${actualRepository.repositoryName || 'undefined'}`,
      );
    }

    // Validate repository ARN.
    if (actualRepository.repositoryArn !== response.repositoryArn) {
      throw new TransactionError(
        `ECR Repository ARN mismatch. Expected: ${response.repositoryArn}, Actual: ${actualRepository.repositoryArn || 'undefined'}`,
      );
    }

    // Validate repository URI.
    if (actualRepository.repositoryUri !== response.repositoryUri) {
      throw new TransactionError(
        `ECR Repository URI mismatch. Expected: ${response.repositoryUri}, Actual: ${actualRepository.repositoryUri || 'undefined'}`,
      );
    }

    // Validate registry ID (AWS account).
    if (actualRepository.registryId !== response.registryId) {
      throw new TransactionError(
        `ECR Repository registry ID mismatch. Expected: ${response.registryId}, Actual: ${actualRepository.registryId || 'undefined'}`,
      );
    }

    if (actualRepository.registryId !== properties.awsAccountId) {
      throw new TransactionError(
        `ECR Repository registry ID does not match AWS account. Expected: ${properties.awsAccountId}, Actual: ${actualRepository.registryId || 'undefined'}`,
      );
    }

    // Validate ARN format (account and region should match).
    const expectedArnPrefix = `arn:aws:ecr:${properties.awsRegionId}:${properties.awsAccountId}:repository/`;
    if (!response.repositoryArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `ECR Repository ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.repositoryArn}`,
      );
    }

    // Validate image tag mutability.
    if (actualRepository.imageTagMutability !== 'IMMUTABLE') {
      throw new TransactionError(
        `ECR Repository image tag mutability mismatch. Expected: IMMUTABLE, Actual: ${actualRepository.imageTagMutability || 'undefined'}`,
      );
    }

    // Validate image scanning configuration.
    if (actualRepository.imageScanningConfiguration?.scanOnPush !== false) {
      throw new TransactionError(
        `ECR Repository scan on push mismatch. Expected: false, Actual: ${actualRepository.imageScanningConfiguration?.scanOnPush}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateEcrImageResourceAction>(ValidateEcrImageResourceAction)
export class ValidateEcrImageResourceActionFactory {
  private static instance: ValidateEcrImageResourceAction;

  static async create(): Promise<ValidateEcrImageResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateEcrImageResourceAction();
    }
    return this.instance;
  }
}

