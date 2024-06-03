import { CreateFileSystemCommand, DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { IEfsProperties, IEfsResponse } from '../efs.interface.js';
import type { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class AddEfsResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEfsResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.model as Efs;
    const properties = efs.properties as unknown as IEfsProperties;
    const response = efs.response as unknown as IEfsResponse;

    // Get instances.
    const efsClient = await Container.get(EFSClient, { args: [properties.awsRegionId] });

    // Create a new EFS.
    const data = await efsClient.send(
      new CreateFileSystemCommand({
        Backup: false,
        Encrypted: false,
        PerformanceMode: 'generalPurpose',
        ThroughputMode: 'bursting',
      }),
    );

    // Wait for EFS to be available.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await efsClient.send(
          new DescribeFileSystemsCommand({
            FileSystemId: data.FileSystemId,
          }),
        );

        const filesystem = result.FileSystems?.find((f) => f.FileSystemId === data.FileSystemId);
        if (!filesystem) {
          throw new Error('EFS FileSystem does not exist!');
        }
        if (filesystem.LifeCycleState!.toLowerCase() === 'error') {
          throw new Error('EFS FileSystem could not be created!');
        }

        return filesystem.LifeCycleState!.toLowerCase() === 'available';
      },
      {
        maxRetries: 5,
        retryDelayInMs: 5000,
      },
    );

    // Set response.
    response.FileSystemArn = data.FileSystemArn as string;
    response.FileSystemId = data.FileSystemId as string;
  }
}

@Factory<AddEfsResourceAction>(AddEfsResourceAction)
export class AddEfsResourceActionFactory {
  static async create(): Promise<AddEfsResourceAction> {
    return new AddEfsResourceAction();
  }
}
