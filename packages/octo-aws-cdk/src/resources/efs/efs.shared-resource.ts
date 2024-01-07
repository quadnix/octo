import { AResource, ASharedResource, Resource } from '@quadnix/octo';
import { Efs } from './efs.resource.js';

@Resource()
export class SharedEfs extends ASharedResource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  constructor(resourceId: string, properties: object, parents: [Efs?]) {
    super(resourceId, {}, parents as AResource<Efs>[]);
  }
}
