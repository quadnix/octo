import type { IOverlay, ModifyInterface } from '@quadnix/octo';

export interface IS3StorageAccessOverlayProperties
  extends ModifyInterface<IOverlay['properties'], { iamRolePolicyName: string }> {}
