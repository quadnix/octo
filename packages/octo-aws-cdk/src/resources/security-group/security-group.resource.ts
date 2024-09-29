import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/index.js';
import type { ISecurityGroupProperties, ISecurityGroupResponse } from './security-group.interface.js';

@Resource('@octo', 'security-group')
export class SecurityGroup extends AResource<SecurityGroup> {
  declare properties: ISecurityGroupProperties;
  declare response: ISecurityGroupResponse;

  constructor(resourceId: string, properties: ISecurityGroupProperties, parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
