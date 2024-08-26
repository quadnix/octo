import { AResource, DependencyRelationship, Diff, DiffAction, Resource, UnknownResource } from '@quadnix/octo';
import { SecurityGroup } from '../security-group/security-group.resource.js';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { EcsCluster } from './ecs-cluster.resource.js';
import type { IEcsServiceProperties, IEcsServiceResponse } from './ecs-service.interface.js';
import { EcsTaskDefinition } from './ecs-task-definition.resource.js';

type EcsServiceUpdateDiff = {
  parents: { securityGroup: string[]; taskDefinition?: string };
  properties: {
    desiredCount: number;
  };
};

@Resource()
export class EcsService extends AResource<EcsService> {
  readonly NODE_NAME: string = 'ecs-service';

  declare properties: IEcsServiceProperties;
  declare response: IEcsServiceResponse;

  constructor(
    resourceId: string,
    properties: IEcsServiceProperties,
    parents: [EcsCluster, EcsTaskDefinition, Subnet, ...SecurityGroup[]],
  ) {
    super(resourceId, properties, parents);

    this.updateServiceSecurityGroups(parents.filter((p) => p instanceof SecurityGroup) as SecurityGroup[]);
    this.updateServiceTaskDefinition(parents.find((p) => p instanceof EcsTaskDefinition) as EcsTaskDefinition);
  }

  override async diff(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    const sgParentsResourceIds: string[] = [];
    let taskDefinitionParentResourceId: string | undefined;
    let shouldConsolidateDiffs = false;

    for (let i = diffs.length - 1; i >= 0; i--) {
      // Consolidate all SecurityGroup parent updates into a single UPDATE diff.
      if (diffs[i].field === 'parent' && diffs[i].value instanceof SecurityGroup) {
        sgParentsResourceIds.push((diffs[i].value as SecurityGroup).resourceId);
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }

      // Translate TaskDefinition parent update into a single UPDATE diff.
      if (diffs[i].field === 'parent' && diffs[i].value instanceof EcsTaskDefinition) {
        taskDefinitionParentResourceId = (diffs[i].value as EcsTaskDefinition).resourceId;
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }

      // Consolidate property diffs - desiredCount.
      if (diffs[i].action === DiffAction.UPDATE && diffs[i].field === 'desiredCount') {
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(
        new Diff(this, DiffAction.UPDATE, 'resourceId', {
          parents: { securityGroup: sgParentsResourceIds, taskDefinition: taskDefinitionParentResourceId },
          properties: {
            desiredCount: this.properties.desiredCount,
          },
        } as EcsServiceUpdateDiff),
      );
    }

    return diffs;
  }

  override async diffInverse(
    diff: Diff,
    deReferenceResource: (resourceId: string) => Promise<EcsTaskDefinition | SecurityGroup>,
  ): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceFromAnotherGraphTree(diff.node as UnknownResource, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private updateServiceSecurityGroups(securityGroupParents: SecurityGroup[]): void {
    for (const sgParent of securityGroupParents) {
      const ecsToSgDep = this.getDependency(sgParent, DependencyRelationship.CHILD)!;
      const sgToEcsDep = sgParent.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating ecs-service must add security-groups.
      ecsToSgDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting security-groups must update ecs-service.
      sgToEcsDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }

  private updateServiceTaskDefinition(taskDefinitionParent: EcsTaskDefinition): void {
    const ecsToTdDep = this.getDependency(taskDefinitionParent, DependencyRelationship.CHILD)!;

    // Before updating ecs-service must add ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    // Before updating ecs-service must update ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }
}
