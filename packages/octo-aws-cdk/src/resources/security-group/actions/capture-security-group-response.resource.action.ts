import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { SecurityGroupSchema } from '../index.schema.js';
import { SecurityGroup } from '../security-group.resource.js';

/**
 * @internal
 */
@Action(SecurityGroup)
export class CaptureSecurityGroupResponseResourceAction implements IResourceAction<SecurityGroup> {
  filter(diff: Diff): boolean {
    return diff.node instanceof SecurityGroup && hasNodeName(diff.node, 'security-group');
  }

  async handle(_diff: Diff<SecurityGroup>): Promise<void> {}

  async mock(
    _diff: Diff<SecurityGroup>,
    capture: Partial<SecurityGroupSchema['response']>,
  ): Promise<SecurityGroupSchema['response']> {
    return {
      Arn: capture.Arn,
      GroupId: capture.GroupId,
    };
  }
}

@Factory<CaptureSecurityGroupResponseResourceAction>(CaptureSecurityGroupResponseResourceAction)
export class CaptureSecurityGroupResponseResourceActionFactory {
  private static instance: CaptureSecurityGroupResponseResourceAction;

  static async create(): Promise<CaptureSecurityGroupResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureSecurityGroupResponseResourceAction();
    }
    return this.instance;
  }
}
