import { DeleteSecurityGroupCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { SecurityGroup } from '../security-group.resource.js';

/**
 * @internal
 */
@Action(SecurityGroup)
export class DeleteSecurityGroupResourceAction implements IResourceAction<SecurityGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof SecurityGroup &&
      hasNodeName(diff.node, 'security-group') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<SecurityGroup>): Promise<void> {
    // Get properties.
    const securityGroup = diff.node;
    const properties = securityGroup.properties;
    const response = securityGroup.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete Security Group.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        await ec2Client.send(
          new DeleteSecurityGroupCommand({
            GroupId: response.GroupId,
          }),
        );
        return true;
      },
      {
        initialDelayInMs: 0,
        maxRetries: 5,
        retryDelayInMs: 5000,
        throwOnError: false,
      },
    );
  }

  async mock(diff: Diff<SecurityGroup>): Promise<void> {
    // Get properties.
    const securityGroup = diff.node;
    const properties = securityGroup.properties;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteSecurityGroupCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteSecurityGroupResourceAction>(DeleteSecurityGroupResourceAction)
export class DeleteSecurityGroupResourceActionFactory {
  private static instance: DeleteSecurityGroupResourceAction;

  static async create(): Promise<DeleteSecurityGroupResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteSecurityGroupResourceAction(container);
    }
    return this.instance;
  }
}
