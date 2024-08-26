import { AResource, DependencyRelationship, Diff, DiffAction, Resource } from '@quadnix/octo';
import { Efs } from '../efs/efs.resource.js';
import type { IamRole } from '../iam/iam-role.resource.js';
import type { IEcsTaskDefinitionProperties, IEcsTaskDefinitionResponse } from './ecs-task-definition.interface.js';

type EcsTaskDefinitionUpdateDiff = {
  parents: { efs: string[] };
  properties: {
    environmentVariables: IEcsTaskDefinitionProperties['environmentVariables'];
    image: IEcsTaskDefinitionProperties['image'];
  };
};

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

    const efsParentsResourceIds: string[] = [];
    let shouldConsolidateDiffs = false;

    for (let i = diffs.length - 1; i >= 0; i--) {
      // Consolidate all Efs parent updates into a single UPDATE diff.
      if (diffs[i].field === 'parent' && diffs[i].value instanceof Efs) {
        efsParentsResourceIds.push((diffs[i].value as Efs).resourceId);
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }

      // Consolidate property diffs - environment variables & image.
      if (
        (diffs[i].action === DiffAction.ADD ||
          diffs[i].action === DiffAction.UPDATE ||
          diffs[i].action === DiffAction.DELETE) &&
        (diffs[i].field === 'environmentVariables' || diffs[i].field === 'image')
      ) {
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(
        new Diff(this, DiffAction.UPDATE, 'resourceId', {
          parents: {
            efs: efsParentsResourceIds,
          },
          properties: {
            environmentVariables: JSON.parse(JSON.stringify(this.properties.environmentVariables)),
            image: JSON.parse(JSON.stringify(this.properties.image)),
          },
        } as EcsTaskDefinitionUpdateDiff),
      );
    }

    return diffs;
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<Efs>): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceFromAnotherGraphTree(diff.node as EcsTaskDefinition, deReferenceResource);
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
