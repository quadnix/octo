import { type Execution, ExecutionSchema, type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EcsServiceAnchorSchema } from '../../../anchors/ecs-service/ecs-service.anchor.schema.js';
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
import { AwsAlbEcsExecutionSchema } from './overlays/alb-ecs-execution/aws-alb-ecs-execution.schema.js';

export { AwsAlbEcsExecutionSchema };

/**
 * @group Modules/Service/EcsBasedAlbService
 */
export class AwsAlbServiceModuleTargetGroupSchema {
  @Validate({ options: { maxLength: 20, minLength: 1 } })
  containerName = Schema<string>();

  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  containerPort = Schema<number>();

  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: EcsServiceAnchorSchema }], NODE_NAME: 'execution' },
      },
    },
    {
      destruct: (value: AwsAlbServiceModuleTargetGroupSchema['execution']): ExecutionSchema[] => [value.synth()],
      options: {
        isSchema: { schema: ExecutionSchema },
      },
    },
  ])
  execution = Schema<Execution>();

  @Validate({
    destruct: (value: AwsAlbServiceModuleTargetGroupSchema['healthCheck']): AlbTargetGroupHealthCheckSchema[] =>
      value ? [value] : [],
    options: { isSchema: { schema: AlbTargetGroupHealthCheckSchema } },
  })
  healthCheck? = Schema<AlbTargetGroupHealthCheckSchema | null>(null);

  @Validate({ options: { maxLength: 32, minLength: 1 } })
  Name = Schema<string>();
}

/**
 * @group Modules/Service/EcsBasedAlbService
 */
export class AwsAlbServiceModuleSchema {
  @Validate({ options: { minLength: 1 } })
  albName = Schema<string>();

  @Validate<unknown>([
    {
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): number[] => value.map((v) => v.Port),
      options: { maxLength: 65535, minLength: 1 },
    },
    {
      // DefaultActions array must be of length 1.
      destruct: (
        value: AwsAlbServiceModuleSchema['listeners'],
      ): [AlbListenerSchema['properties']['DefaultActions']] => [value.map((v) => v.DefaultActions).flat()],
      options: { maxLength: 1, minLength: 1 },
    },
    {
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerActionFixedResponseActionSchema[] =>
        value.map((v) => v.DefaultActions.filter((a) => a.actionType === 'fixed-response').map((a) => a.action)).flat(),
      options: { isSchema: { schema: AlbListenerActionFixedResponseActionSchema } },
    },
    {
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerActionForwardConfigSchema[] =>
        value.map((v) => v.DefaultActions.filter((a) => a.actionType === 'forward').map((a) => a.action)).flat(),
      options: { isSchema: { schema: AlbListenerActionForwardConfigSchema } },
    },
    {
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerActionRedirectActionSchema[] =>
        value.map((v) => v.DefaultActions.filter((a) => a.actionType === 'redirect').map((a) => a.action)).flat(),
      options: { isSchema: { schema: AlbListenerActionRedirectActionSchema } },
    },
    {
      // rules array can be empty.
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): [AlbListenerSchema['properties']['rules']] => [
        value.map((v) => v.rules).flat(),
      ],
      options: { minLength: 0 },
    },
    {
      // Each rule must have at least one action.
      destruct: (
        value: AwsAlbServiceModuleSchema['listeners'],
      ): AlbListenerSchema['properties']['rules'][0]['actions'][] =>
        value.map((v) => v.rules.map((r) => r.actions)).flat(),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerActionFixedResponseActionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerActionForwardConfigSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerActionRedirectActionSchema[] =>
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
        value: AwsAlbServiceModuleSchema['listeners'],
      ): AlbListenerSchema['properties']['rules'][0]['conditions'][] =>
        value.map((v) => v.rules.map((r) => r.conditions)).flat(),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerRuleHostHeaderConditionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerRuleHttpHeaderConditionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerRuleHttpRequestMethodConditionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerRulePathPatternConditionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerRuleQueryStringConditionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): AlbListenerRuleSourceIpConditionSchema[] =>
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
      destruct: (value: AwsAlbServiceModuleSchema['listeners']): number[] =>
        value.map((v) => v.rules.map((r) => r.Priority)).flat(),
      options: { maxLength: 999, minLength: 1 },
    },
  ])
  listeners = Schema<Pick<AlbListenerSchema['properties'], 'DefaultActions' | 'Port' | 'rules'>[]>();

  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  @Validate({
    destruct: (value: AwsAlbServiceModuleSchema['subnets']): string[] =>
      value.map((v) => [v.subnetCidrBlock, v.subnetName]).flat(),
    options: { minLength: 1 },
  })
  subnets = Schema<{ subnetCidrBlock: string; subnetName: string }[]>();

  @Validate({
    destruct: (value: AwsAlbServiceModuleSchema['targets']): AwsAlbServiceModuleTargetGroupSchema[] => value!,
    options: { isSchema: { schema: AwsAlbServiceModuleTargetGroupSchema } },
  })
  targets? = Schema<AwsAlbServiceModuleTargetGroupSchema[]>([]);
}
