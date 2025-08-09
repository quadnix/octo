import { BaseAnchorSchema, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Server} model representing a server, e.g. backend,
 * running in an AWS ECS cluster.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsServerAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Server;

  /**
   * Input properties.
   * * `properties.deploymentType` - The deployment type. Possible values are `ecs`.
   * * `properties.serverKey` - The server key.
   */
  @Validate([
    {
      destruct: (value: AwsEcsServerAnchorSchema['properties']): string[] => [value.deploymentType],
      options: { regex: /^ecs$/ },
    },
    {
      destruct: (value: AwsEcsServerAnchorSchema['properties']): string[] => [value.deploymentType, value.serverKey],
      options: { minLength: 1 },
    },
  ])
  override properties = Schema<{
    deploymentType: 'ecs';
    serverKey: string;
  }>();
}
