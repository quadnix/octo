import { BaseAnchorSchema, type Environment, Schema, Validate } from '@quadnix/octo';

/**
 * @group Anchors/EcsCluster
 */
export class EcsClusterAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Environment;

  @Validate([
    {
      destruct: (value: EcsClusterAnchorSchema['properties']): string[] => [value.clusterName],
      options: { minLength: 1 },
    },
    {
      destruct: (value: EcsClusterAnchorSchema['properties']): string[] => Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: EcsClusterAnchorSchema['properties']): string[] => Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
  ])
  override properties = Schema<{
    clusterName: string;
    environmentVariables: Record<string, string>;
  }>();
}
