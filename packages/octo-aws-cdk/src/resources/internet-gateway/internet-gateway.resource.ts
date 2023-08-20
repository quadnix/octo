import { Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource';

export class InternetGateway extends Resource<InternetGateway> {
  readonly MODEL_NAME: string = 'internet-gateway';

  constructor(resourceId: string, parents: [Vpc]) {
    super(resourceId);

    this.associateWith(parents);
  }
}
