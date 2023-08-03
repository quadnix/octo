import { CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IAction, IActionInputRequest } from '@quadnix/octo';

export class AddRegionAction implements IAction {
  readonly ACTION_NAME: string = 'addRegionAction';

  constructor(private readonly ec2Client: EC2Client) {}

  collectInput(): IActionInputRequest {
    return [];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'region' && diff.field === 'regionId';
  }

  async handle(diff: Diff): Promise<void> {
    await this.ec2Client.send(
      new CreateVpcCommand({
        CidrBlock: '10.0.0.0/16',
        InstanceTenancy: 'default',
      }),
    );
  }

  async revert(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
