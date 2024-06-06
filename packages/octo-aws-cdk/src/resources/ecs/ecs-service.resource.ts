import { AResource, Diff, DiffAction, type IResource, Resource } from '@quadnix/octo';
import type { SecurityGroup } from '../security-group/security-group.resource.js';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { EcsCluster } from './ecs-cluster.resource.js';
import type { IEcsServiceProperties } from './ecs-service.interface.js';
import type { EcsTaskDefinition } from './ecs-task-definition.resource.js';

export type EcsServicePropertyDiff = {
  [key: string]: { action: 'replace' };
};

@Resource()
export class EcsService extends AResource<EcsService> {
  readonly MODEL_NAME: string = 'ecs-service';

  private readonly servicePropertyDiff: EcsServicePropertyDiff = {};

  constructor(
    resourceId: string,
    properties: IEcsServiceProperties,
    parents: [EcsCluster, EcsTaskDefinition, Subnet, ...SecurityGroup[]],
  ) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
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
