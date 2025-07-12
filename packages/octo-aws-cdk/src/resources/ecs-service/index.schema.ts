import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the configuration to associate this target to a target group.
 * The target group is then associated with a load balancer to service traffic.
 *
 * @group Resources/EcsService
 *
 * @hideconstructor
 */
export class EcsServiceLoadBalancerSchema {
  /**
   * The name of the container as defined in the {@link EcsTaskDefinitionImageSchema} resource.
   */
  @Validate({ options: { minLength: 1 } })
  containerName = Schema<string>();

  /**
   * The port of the container as defined in the {@link EcsTaskDefinitionImageSchema} resource.
   */
  @Validate({ options: { minLength: 1 } })
  containerPort = Schema<number>();

  /**
   * The name of the target group as defined in the {@link AlbTargetGroupSchema} resource.
   */
  @Validate({ options: { minLength: 1 } })
  targetGroupName = Schema<string>();
}

/**
 * The `EcsServiceSchema` class is the schema for the `EcsService` resource,
 * which represents the AWS Elastic Container Service (ECS) Service resource.
 * This resource can create a ecs service in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/).
 *
 * @group Resources/EcsService
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   ecs_cluster((Ecs<br>Cluster)) --> ecs_service((Ecs<br>Service))
 *   ecs_task_definition((Ecs<br>Task<br>Definition)) --> ecs_service
 *   subnet((Subnet)) --> ecs_service
 *   alb_target_group((Alb<br>Target<br>Group)) --> ecs_service
 *   security_group((Security<br>Group)) --> ecs_service
 * ```
 * @overrideProperty resourceId - The resource id is of format `ecs-service-<execution-id>`
 */
export class EcsServiceSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.assignPublicIp`: The public IP address type. Valid values are `ENABLED` or `DISABLED`.
   * * `properties.awsAccountId`: The AWS account ID.
   * * `properties.awsRegionId`: The AWS region ID.
   * * `properties.desiredCount`: The desired number of tasks.
   * * `properties.loadBalancers`: The load balancers to use. See {@link EcsServiceLoadBalancerSchema} for options.
   * * `properties.serviceName`: The name of the service.
   */
  @Validate<unknown>([
    {
      destruct: (value: EcsServiceSchema['properties']): string[] => [
        value.assignPublicIp,
        value.awsAccountId,
        value.awsRegionId,
        String(value.desiredCount),
        value.serviceName,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: EcsServiceSchema['properties']): EcsServiceLoadBalancerSchema[] => value.loadBalancers,
      options: { isSchema: { schema: EcsServiceLoadBalancerSchema } },
    },
  ])
  override properties = Schema<{
    assignPublicIp: 'ENABLED' | 'DISABLED';
    awsAccountId: string;
    awsRegionId: string;
    desiredCount: number;
    loadBalancers: EcsServiceLoadBalancerSchema[];
    serviceName: string;
  }>();

  /**
   * Saved response.
   * * `response.serviceArn`: The ARN of the service.
   */
  @Validate({
    destruct: (value: EcsServiceSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.serviceArn) {
        subjects.push(value.serviceArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    serviceArn?: string;
  }>();
}
