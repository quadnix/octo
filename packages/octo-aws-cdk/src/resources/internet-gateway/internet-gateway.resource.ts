import { IResource, Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource';

export class InternetGateway extends Resource<InternetGateway> {
  readonly MODEL_NAME: string = 'internet-gateway';

  constructor(resourceId: string, parents: [Vpc]) {
    super(resourceId, {}, parents);
  }

  static override async unSynth(
    deserializationClass: any,
    resource: IResource,
    deReferenceResource: (resourceId: string) => Promise<Resource<unknown>>,
  ): Promise<Resource<unknown>> {
    const parents = await Promise.all(resource.parents.map((p) => deReferenceResource(p)));
    const deReferencedResource = new InternetGateway(resource.resourceId, parents as [Vpc]);
    for (const key in resource.response) {
      deReferencedResource.response[key] = resource.response[key];
    }
    return deReferencedResource;
  }
}
