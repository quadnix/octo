import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { ISecurityGroupProperties, ISecurityGroupResponse } from './security-group.interface.js';

@Resource()
export class SecurityGroup extends AResource<SecurityGroup> {
  readonly MODEL_NAME: string = 'security-group';

  declare properties: ISecurityGroupProperties;
  declare response: ISecurityGroupResponse;

  constructor(resourceId: string, properties: ISecurityGroupProperties, parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
