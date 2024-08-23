import { AResource, DependencyRelationship, Diff, DiffAction, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-group/security-group.resource.js';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { EcsCluster } from './ecs-cluster.resource.js';
import type { IEcsServiceProperties, IEcsServiceResponse } from './ecs-service.interface.js';
import { EcsTaskDefinition } from './ecs-task-definition.resource.js';

export type EcsServicePropertyDiff = {
  [key: string]: { action: 'replace' };
};

@Resource()
export class EcsService extends AResource<EcsService> {
  readonly NODE_NAME: string = 'ecs-service';

  declare properties: IEcsServiceProperties;
  declare response: IEcsServiceResponse;

  private readonly servicePropertyDiff: EcsServicePropertyDiff = {};

  constructor(
    resourceId: string,
    properties: IEcsServiceProperties,
    parents: [EcsCluster, EcsTaskDefinition, Subnet, ...SecurityGroup[]],
  ) {
    super(resourceId, properties, parents);

    this.updateServiceSecurityGroups(parents.filter((p) => p instanceof SecurityGroup) as SecurityGroup[]);

    const ecsTaskDefinitionParent = parents.find((p) => p instanceof EcsTaskDefinition) as EcsTaskDefinition;
    const ecsToTdDep = this.getDependency(ecsTaskDefinitionParent, DependencyRelationship.CHILD)!;

    // Before updating ecs-service must add ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    // Before updating ecs-service must update ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }

  override async diff(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    // Consolidate all SecurityGroup parent updates into a single UPDATE diff.
    let shouldConsolidateSGDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && diffs[i].value instanceof SecurityGroup) {
        shouldConsolidateSGDiffs = true;
        diffs.splice(i, 1);
      }
    }
    if (shouldConsolidateSGDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    return diffs;
  }

  override async diffProperties(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.servicePropertyDiff && Object.keys(this.servicePropertyDiff).length > 0) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    // Diff desiredCount.
    if (previous.properties.desiredCount !== this.properties.desiredCount) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    // Empty servicePropertyDiff.
    for (const key of Object.keys(this.servicePropertyDiff)) {
      delete this.servicePropertyDiff[key];
    }

    return diffs;
  }

  redeployWithLatestTaskDefinition(): void {
    this.servicePropertyDiff['task-definition'] = { action: 'replace' };
  }

  updateServiceDesiredCount(desiredCount: number): void {
    this.properties.desiredCount = desiredCount;
  }

  updateServiceSecurityGroups(securityGroupParents: SecurityGroup[]): void {
    const previousSgParents =
      this.getParents('security-group')['security-group']?.map((d): SecurityGroup => d.to as SecurityGroup) || [];
    for (const sgParent of previousSgParents) {
      sgParent.removeRelationship(this);
    }
    for (const sgParent of securityGroupParents) {
      const { childToParentDependency: ecsToSgDep, parentToChildDependency: sgToEcsDep } = sgParent.addChild(
        'resourceId',
        this,
        'resourceId',
      );

      // Before updating ecs-service must add security-groups.
      ecsToSgDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting security-groups must update ecs-service.
      sgToEcsDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }
}
