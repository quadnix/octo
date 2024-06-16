import { AResource, DependencyRelationship, Diff, DiffAction, Resource } from '@quadnix/octo';
import type { SecurityGroup } from '../security-group/security-group.resource.js';
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

    const ecsTaskDefinitionParent = parents.find((p) => p instanceof EcsTaskDefinition) as EcsTaskDefinition;
    const dependencyWithTaskDefinition = this.getDependency(ecsTaskDefinitionParent, DependencyRelationship.CHILD);
    dependencyWithTaskDefinition?.addBehavior('task-definition', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    dependencyWithTaskDefinition?.addBehavior('task-definition', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.servicePropertyDiff && Object.keys(this.servicePropertyDiff).length > 0) {
      for (const key of Object.keys(this.servicePropertyDiff)) {
        diffs.push(new Diff(this, DiffAction.UPDATE, key, this.servicePropertyDiff[key]));
      }
    }

    return diffs;
  }

  redeployWithLatestTaskDefinition(): void {
    this.servicePropertyDiff['task-definition'] = { action: 'replace' };
  }
}
