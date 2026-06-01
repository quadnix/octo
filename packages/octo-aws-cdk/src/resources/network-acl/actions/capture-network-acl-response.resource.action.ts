import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { NetworkAclSchema } from '../index.schema.js';
import { NetworkAcl } from '../network-acl.resource.js';

/**
 * @internal
 */
@Action(NetworkAcl)
export class CaptureNetworkAclResponseResourceAction implements IResourceAction<NetworkAcl> {
  filter(diff: Diff): boolean {
    return diff.node instanceof NetworkAcl && hasNodeName(diff.node, 'network-acl');
  }

  async handle(_diff: Diff<NetworkAcl>): Promise<void> {}

  async mock(
    _diff: Diff<NetworkAcl>,
    capture: Partial<NetworkAclSchema['response']>,
  ): Promise<NetworkAclSchema['response']> {
    return {
      NetworkAclId: capture.NetworkAclId,
    };
  }
}

@Factory<CaptureNetworkAclResponseResourceAction>(CaptureNetworkAclResponseResourceAction)
export class CaptureNetworkAclResponseResourceActionFactory {
  private static instance: CaptureNetworkAclResponseResourceAction;

  static async create(): Promise<CaptureNetworkAclResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureNetworkAclResponseResourceAction();
    }
    return this.instance;
  }
}
