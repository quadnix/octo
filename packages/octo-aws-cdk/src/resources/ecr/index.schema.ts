import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `EcrImageSchema` class is the schema for the `EcrImage` resource,
 * which represents the AWS Elastic Container Registry (ECR) Image resource.
 * This resource can create and manage container images in ECR using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecr/).
 *
 * @group Resources/Ecr
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `ecr-<region-id>-<image-id>`
 */
export class EcrImageSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.imageId` - This is the name of the ECR repository.
   * The id usually follows the naming convention of `family/name`, e.g. `quadnix/nginx`.
   */
  @Validate({
    destruct: (value: EcrImageSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId, value.imageId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    imageId: string;
  }>();

  /**
   * Saved response.
   * * `response.registryId` - The AWS account ID associated with the registry that contains the repository.
   * * `response.repositoryArn` - The ARN of the repository.
   * * `response.repositoryName` - The name of the repository.
   * * `response.repositoryUri` - The URI of the repository.
   * You can use this URI for container image push and pull operations.
   */
  @Validate({
    destruct: (value: EcrImageSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.registryId) {
        subjects.push(value.registryId);
      }
      if (value.repositoryArn) {
        subjects.push(value.repositoryArn);
      }
      if (value.repositoryName) {
        subjects.push(value.repositoryName);
      }
      if (value.repositoryUri) {
        subjects.push(value.repositoryUri);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    registryId?: string;
    repositoryArn?: string;
    repositoryName?: string;
    repositoryUri?: string;
  }>();
}
