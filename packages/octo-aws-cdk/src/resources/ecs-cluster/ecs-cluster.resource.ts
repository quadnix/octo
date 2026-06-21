import { ATerraformResource, Diff, DiffAction, DiffUtility, Resource, type TerraformModuleScope } from '@quadnix/octo';
import { EcsClusterSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcsCluster>('@octo', 'ecs-cluster', EcsClusterSchema)
export class EcsCluster extends ATerraformResource<EcsClusterSchema, EcsCluster> {
  declare properties: EcsClusterSchema['properties'];
  declare response: EcsClusterSchema['response'];

  constructor(resourceId: string, properties: EcsClusterSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: EcsCluster): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'name is force-new on aws_ecs_cluster; a change recreates it',
        ),
      ];
    }

    return [];
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const ecsClusterOctoResource = terraform.addOctoTerraformResource(this as EcsCluster, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const ecsClusterTFResource = ecsClusterOctoResource.addTerraformResource('aws_ecs_cluster', this.resourceId, {
      name: this.properties.clusterName,
      setting: [{ name: 'containerInsights', value: 'disabled' }],
    });
    ecsClusterOctoResource.output({
      clusterArn: terraform.raw(`${ecsClusterTFResource.address}.arn`),
    });

    if (Object.keys(this.tags).length > 0) {
      ecsClusterTFResource.attribute('tags', this.tags);
    }
  }
}
