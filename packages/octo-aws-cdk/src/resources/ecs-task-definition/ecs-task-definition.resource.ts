import {
  AResource,
  ATerraformResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
  hasNodeName,
} from '@quadnix/octo';
import { TaskDefinitionUtility } from '../../utilities/task-definition/task-definition.utility.js';
import type { EfsSchema } from '../efs/index.schema.js';
import type { IamRoleSchema } from '../iam-role/index.schema.js';
import { EcsTaskDefinitionSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcsTaskDefinition>('@octo', 'ecs-task-definition', EcsTaskDefinitionSchema)
export class EcsTaskDefinition extends ATerraformResource<EcsTaskDefinitionSchema, EcsTaskDefinition> {
  declare parents: [MatchingResource<IamRoleSchema>, ...MatchingResource<EfsSchema>[]];
  declare properties: EcsTaskDefinitionSchema['properties'];
  declare response: EcsTaskDefinitionSchema['response'];

  constructor(
    resourceId: string,
    properties: EcsTaskDefinitionSchema['properties'],
    parents: [MatchingResource<IamRoleSchema>, ...MatchingResource<EfsSchema>[]],
  ) {
    super(resourceId, properties, parents);

    if (!TaskDefinitionUtility.isCpuAndMemoryValid(properties.cpu, properties.memory)) {
      throw new ResourceError('Invalid values for CPU and/or memory!', this);
    }

    this.updateTaskDefinitionEfs(parents.slice(1).map((p) => p.getActual()));
  }

  override async diff(previous: EcsTaskDefinition): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'iam-role')) {
        // Skip updating TaskDefinition when iam-role is updated.
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'efs')) {
        // Consolidate all Efs parent updates into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'properties' && diffs[i].action === DiffAction.UPDATE) {
        // Consolidate property diffs - cpu, environmentVariables, image, & memory.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    return diffs;
  }

  override async diffProperties(previous: EcsTaskDefinition): Promise<Diff[]> {
    if (
      !DiffUtility.isObjectDeepEquals(previous.properties, this.properties, [
        'cpu',
        'deploymentTag',
        'environmentVariables',
        'images',
        'memory',
      ])
    ) {
      throw new ResourceError('Cannot update ECS Task Definition immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async diffInverse(
    diff: Diff<EcsTaskDefinition>,
    deReferenceResource: (resourceId: string) => Promise<AResource<EfsSchema, any>>,
  ): Promise<void> {
    if (diff.action === DiffAction.UPDATE && diff.field === 'resourceId') {
      await this.cloneResourceInPlace(diff.node, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const iamRoleParent = this.parents[0] as MatchingResource<IamRoleSchema>;
    const efsParents = (this.parents as MatchingResource<EfsSchema>[]).slice(1);

    const containerDefinitions = this.properties.images.map((image) => ({
      command: image.command,
      environment: this.properties.environmentVariables,
      essential: image.essential,
      image: image.uri,
      mountPoints: efsParents.map((efs) => ({
        containerPath: `/mnt/${efs.getSchemaInstance().properties.filesystemName}`,
        readOnly: false,
        sourceVolume: efs.getSchemaInstance().properties.filesystemName,
      })),
      name: image.name,
      portMappings: image.ports.map((p) => ({
        containerPort: p.containerPort,
        hostPort: p.containerPort,
        protocol: p.protocol,
      })),
    }));

    const spec: Record<string, unknown> = {
      container_definitions: terraform.jsonencode(containerDefinitions),
      cpu: String(this.properties.cpu),
      execution_role_arn: terraform.getRef(iamRoleParent, 'Arn'),
      family: this.properties.family,
      memory: String(this.properties.memory),
      network_mode: 'awsvpc',
      requires_compatibilities: ['FARGATE'],
      task_role_arn: terraform.getRef(iamRoleParent, 'Arn'),
    };

    if (efsParents.length > 0) {
      spec['volume'] = efsParents.map((efs) => ({
        efs_volume_configuration: {
          file_system_id: terraform.getRef(efs, 'FileSystemId'),
        },
        name: efs.getSchemaInstance().properties.filesystemName,
      }));
    }

    const tdOctoResource = terraform.addOctoTerraformResource(this as EcsTaskDefinition, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const tdTFResource = tdOctoResource.addTerraformResource('aws_ecs_task_definition', this.resourceId, spec);
    tdOctoResource.output({
      revision: terraform.raw(`${tdTFResource.address}.revision`),
      taskDefinitionArn: terraform.raw(`${tdTFResource.address}.arn`),
    });

    if (Object.keys(this.tags).length > 0) {
      tdTFResource.attribute('tags', this.tags);
    }
  }

  private updateTaskDefinitionEfs(efsParents: ReturnType<MatchingResource<EfsSchema>['getActual']>[]): void {
    for (const efsParent of efsParents) {
      const tdToEfsDep = this.getDependency(efsParent, DependencyRelationship.CHILD)!;
      const efsToTdDep = efsParent.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating ecs-task-definition must add efs.
      tdToEfsDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting efs must update ecs-task-definition.
      efsToTdDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }
}
