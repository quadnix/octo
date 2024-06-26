import { DeleteSecurityGroupCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { ISecurityGroupProperties, ISecurityGroupResponse } from '../security-group.interface.js';
import type { SecurityGroup } from '../security-group.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteSecurityGroupResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'security-group';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.model as SecurityGroup;
    const properties = securityGroup.properties as unknown as ISecurityGroupProperties;
    const response = securityGroup.response as unknown as ISecurityGroupResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Delete Security Group.
    await ec2Client.send(
      new DeleteSecurityGroupCommand({
        GroupId: response.GroupId,
      }),
    );
  }
}

@Factory<DeleteSecurityGroupResourceAction>(DeleteSecurityGroupResourceAction)
export class DeleteSecurityGroupResourceActionFactory {
  static async create(): Promise<DeleteSecurityGroupResourceAction> {
    return new DeleteSecurityGroupResourceAction();
  }
}
