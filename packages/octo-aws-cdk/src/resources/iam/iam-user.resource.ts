import { AResource, Container, Diff, DiffAction, OverlayService, Resource, type UnknownOverlay } from '@quadnix/octo';
import type { IIamUserProperties, IIamUserResponse } from './iam-user.interface.js';

export type IamUserPolicyDiff = { action: 'add' | 'delete'; overlay?: UnknownOverlay; overlayName: string };

@Resource()
export class IamUser extends AResource<IamUser> {
  readonly NODE_NAME: string = 'iam-user';

  declare properties: IIamUserProperties;
  declare response: IIamUserResponse;

  constructor(resourceId: string, properties: IIamUserProperties) {
    super(resourceId, properties, []);
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.action === DiffAction.UPDATE) {
      // Clone properties.
      for (const key of Object.keys((diff.node as IamUser).properties)) {
        this.properties[key] = JSON.parse(JSON.stringify((diff.node as IamUser).properties[key]));
      }

      // Clone responses.
      for (const key of Object.keys((diff.node as IamUser).response)) {
        this.response[key] = JSON.parse(JSON.stringify((diff.node as IamUser).response[key]));
      }
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: IamUser): Promise<Diff[]> {
    const diffs: Diff[] = [];
    const overlayService = await Container.get(OverlayService);

    for (const { overlayId, overlayName } of previous.properties.overlays) {
      if (!this.properties.overlays.find((o) => overlayId === o.overlayId)) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, overlayId, {
            action: 'delete',
            overlayName,
          } as IamUserPolicyDiff),
        );
      }
    }
    for (const { overlayId, overlayName } of this.properties.overlays) {
      if (!previous.properties.overlays.find((o) => overlayId === o.overlayId)) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, overlayId, {
            action: 'add',
            overlay: overlayService.getOverlayById(overlayId),
            overlayName,
          } as IamUserPolicyDiff),
        );
      }
    }

    return diffs;
  }

  updatePolicyDiff(overlay: UnknownOverlay): void {
    const index = this.properties.overlays.findIndex((o) => o.overlayId === overlay.overlayId);
    if (index === -1) {
      this.properties.overlays.push({ overlayId: overlay.overlayId, overlayName: overlay.NODE_NAME });
    }
  }
}
