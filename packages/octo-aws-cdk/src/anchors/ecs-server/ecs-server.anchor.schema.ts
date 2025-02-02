import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class EcsServerAnchorSchema extends BaseAnchorSchema {
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
