import {
  type Execution,
  ExecutionSchema,
  type Region,
  RegionSchema,
  Schema,
  type Subnet,
  SubnetSchema,
  Validate,
} from '@quadnix/octo';
import { AwsEcsServiceAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import {
  AlbListenerActionFixedResponseActionSchema,
  AlbListenerActionForwardConfigSchema,
  AlbListenerActionRedirectActionSchema,
  AlbListenerRuleHostHeaderConditionSchema,
  AlbListenerRuleHttpHeaderConditionSchema,
  AlbListenerRuleHttpRequestMethodConditionSchema,
  AlbListenerRulePathPatternConditionSchema,
  AlbListenerRuleQueryStringConditionSchema,
  AlbListenerRuleSourceIpConditionSchema,
  AlbListenerSchema,
} from '../../../resources/alb-listener/index.schema.js';
import { AlbTargetGroupHealthCheckSchema } from '../../../resources/alb-target-group/index.schema.js';

/**
 * Defines the target group configuration for ALB services.
 * Target groups route requests to registered targets (such as ECS tasks)
 * based on the configured health checks and routing rules.
 * This schema specifies how the ALB will forward traffic to specific containers in ECS executions.
 *
 * @group Modules/Service/AwsEcsAlbService
 *
 * @hideconstructor
 */
export class AwsEcsAlbServiceModuleTargetGroupSchema {
  /**
   * The name of the container within the ECS task that will receive traffic.
   * This must match the container name defined in the task definition.
   */
  @Validate({ options: { maxLength: 20, minLength: 1 } })
  containerName = Schema<string>();

  /**
   * The port number on the container where traffic will be forwarded.
   * This should match the port that the application is listening on inside the container.
   */
  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  containerPort = Schema<number>();

  /**
   * The ECS execution that contains the target containers for this target group.
   * The execution must have ECS service anchors configured to be eligible as an ALB target.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsEcsServiceAnchorSchema }], NODE_NAME: 'execution' },
      },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleTargetGroupSchema['execution']): ExecutionSchema[] => [value.synth()],
      options: {
        isSchema: { schema: ExecutionSchema },
      },
    },
  ])
  execution = Schema<Execution>();

  /**
   * Health check configuration for the target group.
   * Defines how the ALB determines whether targets are healthy and can receive traffic.
   * If not specified, default health check settings will be used.
   * See {@link AlbTargetGroupHealthCheckSchema} for options.
   */
  @Validate({
    options: { isSchema: { schema: AlbTargetGroupHealthCheckSchema } },
  })
  healthCheck = Schema<AlbTargetGroupHealthCheckSchema>();

  /**
   * The name of the target group.
   * This name is used to identify the target group within the ALB configuration
   * and must be unique within the load balancer.
   */
  @Validate({ options: { maxLength: 32, minLength: 1 } })
  Name = Schema<string>();
}

/**
 * `AwsEcsAlbServiceModuleSchema` is the input schema for the `AwsEcsAlbServiceModule` module.
 * This schema defines the comprehensive configuration for Application Load Balancers including
 * listener rules, target groups, routing conditions, and network placement.
 *
 * @group Modules/Service/AwsEcsAlbService
 *
 * @hideconstructor
 *
 * @see {@link AwsEcsAlbServiceModule} to learn more about the `AwsEcsAlbServiceModule` module.
 */
export class AwsEcsAlbServiceModuleSchema {
  /**
   * The name of the Application Load Balancer.
   * This name must be unique within the region and will be used to identify the ALB resource.
   */
  @Validate({ options: { minLength: 1 } })
  albName = Schema<string>();

  /**
   * The listener configuration for the ALB.
   * Listeners check for connection requests on specified ports and protocols, and route traffic
   * based on configured rules and actions. Each listener can have multiple rules for complex routing scenarios.
   *
   * The configuration includes:
   * - Port: The port on which the listener accepts connections
   * - DefaultActions: The default action when no rules match (exactly one action required)
   * - rules: Array of routing rules with conditions and actions (can be empty)
   *
   * Supported action types: 'forward', 'redirect', 'fixed-response'
   * Supported condition types: 'host-header', 'http-header', 'http-request-method',
   * 'path-pattern', 'query-string', 'source-ip'
   */
  @Validate<unknown>([
    {
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): number[] => value.map((v) => v.Port),
      options: { maxLength: 65535, minLength: 1 },
    },
    {
      // DefaultActions array must be of length 1.
      destruct: (
        value: AwsEcsAlbServiceModuleSchema['listeners'],
      ): [AlbListenerSchema['properties']['DefaultActions']] => [value.map((v) => v.DefaultActions).flat()],
      options: { maxLength: 1, minLength: 1 },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerActionFixedResponseActionSchema[] =>
        value.map((v) => v.DefaultActions.filter((a) => a.actionType === 'fixed-response').map((a) => a.action)).flat(),
      options: { isSchema: { schema: AlbListenerActionFixedResponseActionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerActionForwardConfigSchema[] =>
        value.map((v) => v.DefaultActions.filter((a) => a.actionType === 'forward').map((a) => a.action)).flat(),
      options: { isSchema: { schema: AlbListenerActionForwardConfigSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerActionRedirectActionSchema[] =>
        value.map((v) => v.DefaultActions.filter((a) => a.actionType === 'redirect').map((a) => a.action)).flat(),
      options: { isSchema: { schema: AlbListenerActionRedirectActionSchema } },
    },
    {
      // rules array can be empty.
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): [AlbListenerSchema['properties']['rules']] => [
        value.map((v) => v.rules).flat(),
      ],
      options: { minLength: 0 },
    },
    {
      // Each rule must have at least one action.
      destruct: (
        value: AwsEcsAlbServiceModuleSchema['listeners'],
      ): AlbListenerSchema['properties']['rules'][0]['actions'][] =>
        value.map((v) => v.rules.map((r) => r.actions)).flat(),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerActionFixedResponseActionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.actions)
              .flat()
              .filter((a) => a.actionType === 'fixed-response')
              .map((a) => a.action),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerActionFixedResponseActionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerActionForwardConfigSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.actions)
              .flat()
              .filter((a) => a.actionType === 'forward')
              .map((a) => a.action),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerActionForwardConfigSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerActionRedirectActionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.actions)
              .flat()
              .filter((a) => a.actionType === 'redirect')
              .map((a) => a.action),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerActionRedirectActionSchema } },
    },
    {
      // Each rule must have at least one condition.
      destruct: (
        value: AwsEcsAlbServiceModuleSchema['listeners'],
      ): AlbListenerSchema['properties']['rules'][0]['conditions'][] =>
        value.map((v) => v.rules.map((r) => r.conditions)).flat(),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerRuleHostHeaderConditionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.conditions)
              .flat()
              .filter((c) => c.conditionType === 'host-header')
              .map((c) => c.condition),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerRuleHostHeaderConditionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerRuleHttpHeaderConditionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.conditions)
              .flat()
              .filter((c) => c.conditionType === 'http-header')
              .map((c) => c.condition),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerRuleHttpHeaderConditionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerRuleHttpRequestMethodConditionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.conditions)
              .flat()
              .filter((c) => c.conditionType === 'http-request-method')
              .map((c) => c.condition),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerRuleHttpRequestMethodConditionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerRulePathPatternConditionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.conditions)
              .flat()
              .filter((c) => c.conditionType === 'path-pattern')
              .map((c) => c.condition),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerRulePathPatternConditionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerRuleQueryStringConditionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.conditions)
              .flat()
              .filter((c) => c.conditionType === 'query-string')
              .map((c) => c.condition),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerRuleQueryStringConditionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): AlbListenerRuleSourceIpConditionSchema[] =>
        value
          .map((v) =>
            v.rules
              .map((r) => r.conditions)
              .flat()
              .filter((c) => c.conditionType === 'source-ip')
              .map((c) => c.condition),
          )
          .flat(),
      options: { isSchema: { schema: AlbListenerRuleSourceIpConditionSchema } },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['listeners']): number[] =>
        value.map((v) => v.rules.map((r) => r.Priority)).flat(),
      options: { maxLength: 999, minLength: 1 },
    },
  ])
  listeners = Schema<Pick<AlbListenerSchema['properties'], 'DefaultActions' | 'Port' | 'rules'>[]>();

  /**
   * The AWS region where the ALB will be created.
   * The region must have AWS region anchors configured.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['region']): RegionSchema[] => [value.synth()],
      options: {
        isSchema: { schema: RegionSchema },
      },
    },
  ])
  region = Schema<Region>();

  /**
   * The subnets where the ALB will be deployed.
   * ALBs require at least two subnets in different availability zones for high availability.
   * All specified subnets must be public subnets to allow internet access to the load balancer.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['subnets']): Subnet[] => value!,
      options: {
        isModel: { NODE_NAME: 'subnet' },
      },
    },
    {
      destruct: (value: AwsEcsAlbServiceModuleSchema['subnets']): SubnetSchema[] => value.map((v) => v.synth()),
      options: {
        isSchema: { schema: SubnetSchema },
      },
    },
  ])
  subnets = Schema<Subnet[]>();

  /**
   * Optional target groups for the ALB.
   * Target groups define how the ALB routes traffic to registered targets.
   * Each target group specifies an execution, container, and port configuration.
   */
  @Validate({
    destruct: (value: AwsEcsAlbServiceModuleSchema['targets']): AwsEcsAlbServiceModuleTargetGroupSchema[] => value!,
    options: { isSchema: { schema: AwsEcsAlbServiceModuleTargetGroupSchema } },
  })
  targets? = Schema<AwsEcsAlbServiceModuleTargetGroupSchema[]>([]);
}
