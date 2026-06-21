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
   * * `response.authorizationToken` - The base64-encoded authorization token for authenticating to the registry.
   * * `response.proxyEndpoint` - The registry URL for container image push and pull operations.
   * * `response.registryId` - The AWS account ID associated with the registry that contains the repository.
   * * `response.repositoryArn` - The ARN of the repository.
   * * `response.repositoryName` - The name of the repository.
   * * `response.repositoryUri` - The URI of the repository.
   */
  @Validate({
    destruct: (value: EcrImageSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.authorizationToken) {
        subjects.push(value.authorizationToken);
      }
      if (value.proxyEndpoint) {
        subjects.push(value.proxyEndpoint);
      }
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
    authorizationToken?: string;
    proxyEndpoint?: string;
    registryId?: string;
    repositoryArn?: string;
    repositoryName?: string;
    repositoryUri?: string;
  }>({
    authorizationToken: 'token',
    proxyEndpoint: 'https://000000000000.dkr.ecr.us-east-1.amazonaws.com',
    registryId: '000000000000',
    repositoryArn: 'arn:aws:ecr:us-east-1:000000000000:repository/mock-repository',
    repositoryName: 'mock-repository',
    repositoryUri: '000000000000.dkr.ecr.us-east-1.amazonaws.com/mock-repository',
  });
}
