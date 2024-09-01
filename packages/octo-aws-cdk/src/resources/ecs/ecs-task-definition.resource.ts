import { AResource, DependencyRelationship, Diff, DiffAction, Resource } from '@quadnix/octo';
import { Efs } from '../efs/efs.resource.js';
import type { IamRole } from '../iam/iam-role.resource.js';
import { EcsService } from './ecs-service.resource.js';
import type { IEcsTaskDefinitionProperties, IEcsTaskDefinitionResponse } from './ecs-task-definition.interface.js';

@Resource()
export class EcsTaskDefinition extends AResource<EcsTaskDefinition> {
  readonly NODE_NAME: string = 'ecs-task-definition';

  declare properties: IEcsTaskDefinitionProperties;
  declare response: IEcsTaskDefinitionResponse;

  constructor(resourceId: string, properties: IEcsTaskDefinitionProperties, parents: [IamRole, ...Efs[]]) {
    super(resourceId, properties, parents);

    this.updateTaskDefinitionEfs(parents.filter((p) => p instanceof Efs) as Efs[]);
  }

  override async diff(previous: EcsTaskDefinition): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && diffs[i].value instanceof Efs) {
        // Consolidate all Efs parent updates into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (
        (diffs[i].field === 'environmentVariables' || diffs[i].field === 'image') &&
        (diffs[i].action === DiffAction.ADD ||
          diffs[i].action === DiffAction.UPDATE ||
          diffs[i].action === DiffAction.DELETE)
      ) {
        // Consolidate property diffs - environment variables & image.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));

      // When ecs-task-definition is updated, all ecs-service using this must be updated too.
      const ecsServices = this.getChildren('ecs-service')['ecs-service'].map((d) => d.to as EcsService);
      for (const ecsService of ecsServices) {
        diffs.push(new Diff(ecsService, DiffAction.UPDATE, 'resourceId', ''));
      }
    }

    return diffs;
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<Efs>): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceInPlace(diff.node as EcsTaskDefinition, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private updateTaskDefinitionEfs(efsParents: Efs[]): void {
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
