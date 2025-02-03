import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class EcsExecutionAnchorSchema extends BaseAnchorSchema {
  @Validate([
    {
      destruct: (value: EcsExecutionAnchorSchema['properties']): string[] => Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: EcsExecutionAnchorSchema['properties']): string[] => Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
  ])
  override properties = Schema<{
    environmentVariables: Record<string, string>;
  }>();
}
