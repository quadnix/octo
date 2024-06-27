import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { Efs } from '../efs/efs.resource.js';
import type { IamRole } from '../iam/iam-role.resource.js';
import type { IEcsTaskDefinitionProperties, IEcsTaskDefinitionResponse } from './ecs-task-definition.interface.js';

@Resource()
export class EcsTaskDefinition extends AResource<EcsTaskDefinition> {
  readonly MODEL_NAME: string = 'ecs-task-definition';

  declare properties: IEcsTaskDefinitionProperties;
  declare response: IEcsTaskDefinitionResponse;

  constructor(resourceId: string, properties: IEcsTaskDefinitionProperties, parents: [IamRole, ...Efs[]]) {
    super(resourceId, properties, parents);

    this.updateTaskDefinitionEfs(parents.filter((p) => p instanceof Efs) as Efs[]);
  }

  override async diff(previous: EcsTaskDefinition): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    // Consolidate all Efs parent updates into a single UPDATE diff.
    let shouldConsolidateEfsDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && diffs[i].value instanceof Efs) {
        shouldConsolidateEfsDiffs = true;
        diffs.splice(i, 1);
      }
    }
    if (shouldConsolidateEfsDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    return diffs;
  }

  updateTaskDefinitionEfs(efsParents: Efs[]): void {
    const previousEfsParents = this.getParents('efs')['efs']?.map((d): Efs => d.to as Efs) || [];
    for (const efsParent of previousEfsParents) {
      efsParent.removeRelationship(this);
    }
    for (const efsParent of efsParents) {
      const { childToParentDependency: tdToEfsDep, parentToChildDependency: efsToTdDep } = efsParent.addChild(
        'resourceId',
        this,
        'resourceId',
      );

      // Before updating ecs-task-definition must add efs.
      tdToEfsDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting efs must update ecs-task-definition.
      efsToTdDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }

  updateTaskDefinitionEnvironmentVariables(
    environmentVariables: IEcsTaskDefinitionProperties['environmentVariables'],
  ): void {
    this.properties.environmentVariables = [...environmentVariables];
  }

  updateTaskDefinitionImage(image: IEcsTaskDefinitionProperties['image']): void {
    this.properties.image = { ...image };
  }
}
