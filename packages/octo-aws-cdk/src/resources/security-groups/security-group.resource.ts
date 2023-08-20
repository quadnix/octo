import { Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource';
import { ISecurityGroupProperties } from './security-group.interface';

export class SecurityGroup extends Resource<SecurityGroup> {
  readonly MODEL_NAME: string = 'security-group';

  constructor(resourceId: string, properties: ISecurityGroupProperties, parents: [Vpc]) {
    super(resourceId);

    this.properties.rules = JSON.stringify(properties.rules);

    this.associateWith(parents);
  }
}
