import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachUserPolicyCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { type IIamUserPolicyDiff, IamUser, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-user.resource.js';
import type { IIamUserS3BucketPolicy, IamUserSchema } from '../iam-user.schema.js';

@Action(IamUser)
export class UpdateIamUserWithS3StoragePolicyResourceAction implements IResourceAction<IamUser> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamUser &&
      (diff.node.constructor as typeof IamUser).NODE_NAME === 'iam-user' &&
      diff.field === 's3-storage-access-policy'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.node as IamUser;
    const iamUserPolicyDiff = diff.value as IIamUserPolicyDiff;
    const properties = iamUser.properties;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Attach policies to IAM User to read/write from bucket.
    if (isAddPolicyDiff(iamUserPolicyDiff)) {
      const policyDocument: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];
      const policy = iamUserPolicyDiff.policy as IIamUserS3BucketPolicy;

      if (policy.allowRead) {
        policyDocument.push({
          Action: [
            's3:GetObject',
            's3:GetObjectAttributes',
            's3:GetObjectTagging',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionAttributes',
            's3:GetObjectVersionTagging',
            's3:ListBucket',
          ],
          Effect: 'Allow',
          Resource:
            policy.remoteDirectoryPath === '' || policy.remoteDirectoryPath === '/'
              ? [`arn:aws:s3:::${policy.bucketName}`, `arn:aws:s3:::${policy.bucketName}/*`]
              : [
                  `arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}`,
                  `arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}/*`,
                ],
          Sid: `Allow read from bucket ${policy.bucketName}`,
        });
      }
      if (policy.allowWrite) {
        policyDocument.push({
          Action: ['s3:PutObject', 's3:DeleteObjectVersion', 's3:DeleteObject'],
          Effect: 'Allow',
          Resource:
            policy.remoteDirectoryPath === '' || policy.remoteDirectoryPath === '/'
              ? [`arn:aws:s3:::${policy.bucketName}`, `arn:aws:s3:::${policy.bucketName}/*`]
              : [`arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}/*`],
          Sid: `Allow write from bucket ${policy.bucketName}`,
        });
      }

      const data = await iamClient.send(
        new CreatePolicyCommand({
          PolicyDocument: JSON.stringify({
            Statement: policyDocument,
          }),
          PolicyName: iamUserPolicyDiff.policyId,
        }),
      );
      await iamClient.send(
        new AttachUserPolicyCommand({
          PolicyArn: data.Policy!.Arn,
          UserName: response.UserName,
        }),
      );

      // Set response.
      response.policies[iamUserPolicyDiff.policyId] = [data.Policy!.Arn!];
    } else if (isDeletePolicyDiff(iamUserPolicyDiff)) {
      const policyARNs = response.policies[iamUserPolicyDiff.policyId] || [];
      await Promise.all(
        policyARNs.map(async (policyArn) => {
          await iamClient.send(
            new DetachUserPolicyCommand({
              PolicyArn: policyArn,
              UserName: response.UserName,
            }),
          );
          await iamClient.send(
            new DeletePolicyCommand({
              PolicyArn: policyArn,
            }),
          );
        }),
      );

      // Set response.
      if (!Object.isFrozen(response)) {
        delete response.policies[iamUserPolicyDiff.policyId];
      }
    }
  }

  async mock(diff: Diff, capture: Partial<IamUserSchema['response']>): Promise<void> {
    const iamUser = diff.node as IamUser;
    const iamUserPolicyDiff = diff.value as IIamUserPolicyDiff;
    const properties = iamUser.properties;

    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreatePolicyCommand) {
        return { Policy: { Arn: capture.policies![iamUserPolicyDiff.policyId][0] } };
      } else if (instance instanceof AttachUserPolicyCommand) {
        return;
      } else if (instance instanceof DetachUserPolicyCommand) {
        return;
      } else if (instance instanceof DeletePolicyCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateIamUserWithS3StoragePolicyResourceAction>(UpdateIamUserWithS3StoragePolicyResourceAction)
export class UpdateIamUserWithS3StoragePolicyResourceActionFactory {
  private static instance: UpdateIamUserWithS3StoragePolicyResourceAction;

  static async create(): Promise<UpdateIamUserWithS3StoragePolicyResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamUserWithS3StoragePolicyResourceAction(container);
    }
    return this.instance;
  }
}
