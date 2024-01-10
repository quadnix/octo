import { AModel, AResource, Diff, DiffAction, IResource, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-groups/security-group.resource.js';
import { Subnet } from '../subnet/subnet.resource.js';
import { IEfsProperties } from './efs.interface.js';
import { SharedEfs } from './efs.shared-resource.js';

@Resource()
export class Efs extends AResource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  constructor(resourceId: string, properties: IEfsProperties, parents: [Subnet, SecurityGroup]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }

  override async diff(previous?: Efs): Promise<Diff[]> {
    /*
     * An EFS is a "partial" shared resource across AWS regions.
     * In this implementation, we create a new EFS resource per AWS region,
     * but a mount target needs to be created per region (e.g. aws-us-east-1a) since the subnet differs per region.
     * Because of mount target, the diff is always returned, since there is some AWS action required on every operation,
     * regardless of it being a shared resource.
     * */

    const diffs: Diff[] = [];

    const resource = this.isMarkedDeleted() ? previous! : this;
    const sharedResource: SharedEfs | undefined = resource.getSharedResource();
    const efsSharingRegions = sharedResource?.findParentsByProperty([
      { key: 'awsRegionId', value: this.properties.awsRegionId },
    ]);
    const efsSharingRegion = efsSharingRegions?.find((r) => r.resourceId !== this.resourceId);
    const diffValue = efsSharingRegion
      ? {
          FileSystemArn: efsSharingRegion.response.FileSystemArn,
          FileSystemId: efsSharingRegion.response.FileSystemId,
        }
      : undefined;

    if (this.isMarkedDeleted()) {
      diffs.push(new Diff(previous as AModel<IResource, Efs>, DiffAction.DELETE, 'resourceId', diffValue));
      return diffs;
    }

    if (previous) {
      // None of EFS properties are configurable. No UPDATE required.
      return diffs;
    } else {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', diffValue));
      return diffs;
    }
  }
}
