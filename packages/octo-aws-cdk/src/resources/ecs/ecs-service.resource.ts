import { AResource, Diff, DiffAction, IResource, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-group/security-group.resource.js';
import { Subnet } from '../subnet/subnet.resource.js';
import { EcsCluster } from './ecs-cluster.resource.js';
import { IEcsServiceProperties } from './ecs-service.interface.js';
import { EcsTaskDefinition } from './ecs-task-definition.resource.js';

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

  override async diff(previous?: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.isMarkedDeleted()) {
      diffs.push(new Diff(previous || this, DiffAction.DELETE, 'resourceId', this.resourceId));
      return diffs;
    }

    if (!previous) {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
    }

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
