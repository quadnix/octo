import { AResource, Container, Diff, DiffAction, OverlayService, Resource, type UnknownOverlay } from '@quadnix/octo';
import type { IIamRoleProperties, IIamRoleResponse } from './iam-role.interface.js';

export type IamRolePolicyDiff = { action: 'add' | 'delete'; overlay?: UnknownOverlay; overlayName: string };

@Resource()
export class IamRole extends AResource<IamRole> {
  readonly NODE_NAME: string = 'iam-role';

  declare properties: IIamRoleProperties;
  declare response: IIamRoleResponse;

  constructor(resourceId: string, properties: IIamRoleProperties) {
    super(resourceId, properties, []);
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.action === DiffAction.UPDATE) {
      // Clone properties.
      for (const key of Object.keys((diff.node as IamRole).properties)) {
        this.properties[key] = JSON.parse(JSON.stringify((diff.node as IamRole).properties[key]));
      }

      // Clone responses.
      for (const key of Object.keys((diff.node as IamRole).response)) {
        this.response[key] = JSON.parse(JSON.stringify((diff.node as IamRole).response[key]));
      }
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: IamRole): Promise<Diff[]> {
    const diffs: Diff[] = [];
    const overlayService = await Container.get(OverlayService);

    for (const { overlayId, overlayName } of previous.properties.overlays) {
      if (!this.properties.overlays.find((o) => overlayId === o.overlayId)) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, overlayId, {
            action: 'delete',
            overlayName,
          } as IamRolePolicyDiff),
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
          } as IamRolePolicyDiff),
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
