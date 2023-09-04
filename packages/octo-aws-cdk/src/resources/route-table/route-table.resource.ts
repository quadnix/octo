import { IResource, Resource } from '@quadnix/octo';
import { InternetGateway } from '../internet-gateway/internet-gateway.resource';
import { Subnet } from '../subnet/subnet.resource';
import { Vpc } from '../vpc/vpc.resource';

export class RouteTable extends Resource<RouteTable> {
  readonly MODEL_NAME: string = 'route-table';

  constructor(resourceId: string, parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, {}, parents);
  }

  static override async unSynth(
    deserializationClass: any,
    resource: IResource,
    deReferenceResource: (resourceId: string) => Promise<Resource<unknown>>,
  ): Promise<Resource<unknown>> {
    const parents = await Promise.all(resource.parents.map((p) => deReferenceResource(p)));
    const deReferencedResource = new RouteTable(resource.resourceId, parents as [Vpc, InternetGateway, Subnet]);
    for (const key in resource.response) {
      deReferencedResource.response[key] = resource.response[key];
    }
    return deReferencedResource;
  }
}
