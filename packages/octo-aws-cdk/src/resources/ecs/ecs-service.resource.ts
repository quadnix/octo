import { AResource, IResource, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-groups/security-group.resource.js';
import { Subnet } from '../subnet/subnet.resource.js';
import { EcsCluster } from './ecs-cluster.resource.js';
import { IEcsServiceProperties } from './ecs-service.interface.js';
import { EcsTaskDefinition } from './ecs-task-definition.resource.js';

@Resource()
export class EcsService extends AResource<EcsService> {
  readonly MODEL_NAME: string = 'ecs-service';

  constructor(
    resourceId: string,
    properties: IEcsServiceProperties,
    parents: [EcsCluster, EcsTaskDefinition, Subnet, SecurityGroup],
  ) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
