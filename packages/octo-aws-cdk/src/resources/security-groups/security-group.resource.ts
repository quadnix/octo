import { IResource, Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource.js';
import { ISecurityGroupProperties } from './security-group.interface.js';

export class SecurityGroup extends Resource<SecurityGroup> {
  readonly MODEL_NAME: string = 'security-group';

  constructor(resourceId: string, properties: ISecurityGroupProperties, parents: [Vpc]) {
    properties.rules = JSON.stringify(properties.rules) as any;

    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
