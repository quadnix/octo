import {
  AResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
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
export class EcsTaskDefinition extends AResource<EcsTaskDefinitionSchema, EcsTaskDefinition> {
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
