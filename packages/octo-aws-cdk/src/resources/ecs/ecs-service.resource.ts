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
  readonly MODEL_NAME: string = 'ecs-service';

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
    const dependencyWithTaskDefinition = this.getDependency(ecsTaskDefinitionParent, DependencyRelationship.CHILD);
    dependencyWithTaskDefinition?.addBehavior('task-definition', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    dependencyWithTaskDefinition?.addBehavior('task-definition', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }

  override async diff(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    if (this.servicePropertyDiff && Object.keys(this.servicePropertyDiff).length > 0) {
      for (const key of Object.keys(this.servicePropertyDiff)) {
        diffs.push(new Diff(this, DiffAction.UPDATE, key, this.servicePropertyDiff[key]));
      }
    }

    // Replace desiredCount property diff with an UPDATE diff.
    const desiredCountDiffIndex = diffs.findIndex(
      (d) => d.field === 'properties' && (d.value as { key: keyof IEcsServiceProperties }).key === 'desiredCount',
    );
    if (desiredCountDiffIndex > -1) {
      diffs.splice(desiredCountDiffIndex, 1);
      diffs.push(new Diff(this, DiffAction.UPDATE, 'ecs-service', ''));
    }

    // Consolidate all SecurityGroup parent updates into a single UPDATE diff.
    let shouldConsolidateSGDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && diffs[i].value instanceof SecurityGroup) {
        shouldConsolidateSGDiffs = true;
        diffs.splice(i, 1);
      }
    }
    if (shouldConsolidateSGDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'ecs-service', ''));
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
      sgParent.addChild('resourceId', this, 'resourceId');
      const dependency = this.getDependency(sgParent, DependencyRelationship.CHILD);
      dependency?.addBehavior('ecs-service', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    }
  }
}
