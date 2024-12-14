import { AResource, DependencyRelationship, Diff, DiffAction, Resource } from '@quadnix/octo';
import assert from 'node:assert';
import { EcsService } from '../ecs-service/index.js';
import {
  type EcsTaskDefinitionEfs,
  type EcsTaskDefinitionIamRole,
  EcsTaskDefinitionSchema,
} from './ecs-task-definition.schema.js';

@Resource<EcsTaskDefinition>('@octo', 'ecs-task-definition', EcsTaskDefinitionSchema)
export class EcsTaskDefinition extends AResource<EcsTaskDefinitionSchema, EcsTaskDefinition> {
  declare properties: EcsTaskDefinitionSchema['properties'];
  declare response: EcsTaskDefinitionSchema['response'];

  constructor(
    resourceId: string,
    properties: EcsTaskDefinitionSchema['properties'],
    parents: [EcsTaskDefinitionIamRole, ...EcsTaskDefinitionEfs[]],
  ) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'iam-role');
    parents.slice(1).every((p) => assert.strictEqual((p.constructor as typeof AResource).NODE_NAME, 'efs'));

    super(resourceId, properties, parents);

    this.updateTaskDefinitionEfs(parents.filter((p) => this.isEcsTaskDefinitionEfs(p)) as EcsTaskDefinitionEfs[]);
  }

  override async diff(previous: EcsTaskDefinition): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && this.isEcsTaskDefinitionEfs(diffs[i].value as AResource<any, any>)) {
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

      // Since ecs-task-definition is updated, all ecs-service using this must be updated too.
      const ecsServices = this.getChildren('ecs-service')['ecs-service'].map((d) => d.to as EcsService);
      for (const ecsService of ecsServices) {
        diffs.push(new Diff(ecsService, DiffAction.UPDATE, 'resourceId', ''));
      }
    }

    return diffs;
  }

  override async diffInverse(
    diff: Diff,
    deReferenceResource: (resourceId: string) => Promise<EcsTaskDefinitionEfs>,
  ): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceInPlace(diff.node as EcsTaskDefinition, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private isEcsTaskDefinitionEfs(node: AResource<any, any>): boolean {
    return node.response.hasOwnProperty('FileSystemId');
  }

  private updateTaskDefinitionEfs(efsParents: EcsTaskDefinitionEfs[]): void {
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
