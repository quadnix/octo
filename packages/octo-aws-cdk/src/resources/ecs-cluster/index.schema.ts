import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `EcsClusterSchema` class is the schema for the `EcsCluster` resource,
 * which represents the AWS Elastic Container Service (ECS) Cluster resource.
 * This resource can create a ecs cluster in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/).
 *
 * @group Resources/EcsCluster
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `ecs-cluster-<cluster-name>`
 */
export class EcsClusterSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.clusterName` - The name of the ECS cluster.
   */
  @Validate({
    destruct: (value: EcsClusterSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.clusterName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    clusterName: string;
  }>();

  /**
   * Saved response.
   * * `response.clusterArn` - The ARN of the ECS cluster.
   */
  @Validate({
    destruct: (value: EcsClusterSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.clusterArn) {
        subjects.push(value.clusterArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    clusterArn?: string;
  }>();
}
