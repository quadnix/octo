import { AResource, DependencyRelationship, Diff, DiffAction, Resource } from '@quadnix/octo';
import {
  EcsServiceSchema,
  EcsServiceSecurityGroup,
  EcsServiceSubnet,
  EcsServiceTaskDefinition,
  EcsTaskDefinitionEcsCluster,
} from './ecs-service.schema.js';

@Resource<EcsService>('@octo', 'ecs-service', EcsServiceSchema)
export class EcsService extends AResource<EcsServiceSchema, EcsService> {
  declare properties: EcsServiceSchema['properties'];
  declare response: EcsServiceSchema['response'];

  constructor(
    resourceId: string,
    properties: EcsServiceSchema['properties'],
    parents: [EcsTaskDefinitionEcsCluster, EcsServiceTaskDefinition, EcsServiceSubnet, ...EcsServiceSecurityGroup[]],
  ) {
    super(resourceId, properties, parents);

    this.updateServiceSecurityGroups(
      parents.filter((p) => this.isEcsServiceSecurityGroup(p)) as EcsServiceSecurityGroup[],
    );
    this.updateServiceTaskDefinition(
      parents.find((p) => this.isEcsServiceTaskDefinition(p)) as EcsServiceTaskDefinition,
    );
  }

  override async diff(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && this.isEcsServiceSecurityGroup(diffs[i].value as AResource<any, any>)) {
        // Consolidate all SecurityGroup parent updates into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (
        diffs[i].field === 'parent' &&
        this.isEcsServiceTaskDefinition(diffs[i].value as AResource<any, any>)
      ) {
        // Translate TaskDefinition parent update into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'properties' && diffs[i].action === DiffAction.UPDATE) {
        // Consolidate property diffs - desiredCount.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    return diffs;
  }

  override async diffInverse(
    diff: Diff,
    deReferenceResource: (resourceId: string) => Promise<EcsServiceTaskDefinition | EcsServiceSecurityGroup>,
  ): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceInPlace(diff.node as EcsService, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private isEcsServiceSecurityGroup(node: AResource<any, any>): boolean {
    return node.response.hasOwnProperty('GroupId');
  }

  private isEcsServiceTaskDefinition(node: AResource<any, any>): boolean {
    return node.response.hasOwnProperty('taskDefinitionArn');
  }

  private updateServiceSecurityGroups(securityGroupParents: EcsServiceSecurityGroup[]): void {
    for (const sgParent of securityGroupParents) {
      const ecsToSgDep = this.getDependency(sgParent, DependencyRelationship.CHILD)!;
      const sgToEcsDep = sgParent.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating ecs-service must add security-groups.
      ecsToSgDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting security-groups must update ecs-service.
      sgToEcsDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }

  private updateServiceTaskDefinition(taskDefinitionParent: EcsServiceTaskDefinition): void {
    const ecsToTdDep = this.getDependency(taskDefinitionParent, DependencyRelationship.CHILD)!;

    // Before updating ecs-service must add ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    // Before updating ecs-service must update ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }
}
