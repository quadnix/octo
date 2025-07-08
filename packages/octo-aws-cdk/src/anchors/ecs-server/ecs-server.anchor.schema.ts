import { BaseAnchorSchema, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * @group Anchors/EcsServer
 *
 * @hideconstructor
 */
export class EcsServerAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Server;

  @Validate([
    {
      destruct: (value: EcsServerAnchorSchema['properties']): string[] => [value.deploymentType],
      options: { regex: /^ecs$/ },
    },
    {
      destruct: (value: EcsServerAnchorSchema['properties']): string[] => [value.deploymentType, value.serverKey],
      options: { minLength: 1 },
    },
  ])
  override properties = Schema<{
    deploymentType: 'ecs';
    serverKey: string;
  }>();
}
