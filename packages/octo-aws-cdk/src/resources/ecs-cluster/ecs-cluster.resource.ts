import { Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import { EcsClusterSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcsCluster>('@octo', 'ecs-cluster', EcsClusterSchema)
export class EcsCluster extends ATFResource<EcsClusterSchema, EcsCluster> {
  declare properties: EcsClusterSchema['properties'];
  declare response: EcsClusterSchema['response'];

  constructor(resourceId: string, properties: EcsClusterSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: EcsCluster): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update ECS Cluster immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const ecsClusterOctoResource = octoTerraform.addOctoTerraformResource(this as EcsCluster);

    const ecsClusterTFResource = ecsClusterOctoResource.addTerraformResource('aws_ecs_cluster', this.resourceId, {
      name: this.properties.clusterName,
      setting: [{ name: 'containerInsights', value: 'disabled' }],
    });
    ecsClusterOctoResource.output({
      clusterArn: octoTerraform.raw(`${ecsClusterTFResource.address}.arn`),
    });

    if (Object.keys(this.tags).length > 0) {
      ecsClusterTFResource.attribute('tags', this.tags);
    }
  }
}
