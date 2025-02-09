import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachRolePolicyCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { type IIamRolePolicyDiff, IamRole, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-role.resource.js';
import type { IIamRoleS3BucketPolicy, IamRoleSchema } from '../iam-role.schema.js';

@Action(IamRole)
export class UpdateIamRoleWithS3StoragePolicyResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      (diff.node.constructor as typeof IamRole).NODE_NAME === 'iam-role' &&
      diff.field === 's3-storage-access-policy'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const iamRolePolicyDiff = diff.value as IIamRolePolicyDiff;
    const properties = iamRole.properties;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Attach policies to IAM Role to read/write from bucket.
    if (isAddPolicyDiff(iamRolePolicyDiff)) {
      const policyDocument: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];
      const policy = iamRolePolicyDiff.policy as IIamRoleS3BucketPolicy;

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
          PolicyName: iamRolePolicyDiff.policyId,
        }),
      );
      await iamClient.send(
        new AttachRolePolicyCommand({
          PolicyArn: data.Policy!.Arn,
          RoleName: response.RoleName,
        }),
      );

      // Set response.
      response.policies[iamRolePolicyDiff.policyId] = [data.Policy!.Arn!];
    } else if (isDeletePolicyDiff(iamRolePolicyDiff)) {
      const policyARNs = response.policies[iamRolePolicyDiff.policyId] || [];
      await Promise.all(
        policyARNs.map(async (policyArn) => {
          await iamClient.send(
            new DetachRolePolicyCommand({
              PolicyArn: policyArn,
              RoleName: response.RoleName,
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
        delete response.policies[iamRolePolicyDiff.policyId];
      }
    }
  }

  async mock(diff: Diff, capture: Partial<IamRoleSchema['response']>): Promise<void> {
    const iamRole = diff.node as IamRole;
    const iamRolePolicyDiff = diff.value as IIamRolePolicyDiff;
    const properties = iamRole.properties;

    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreatePolicyCommand) {
        return { Policy: { Arn: capture.policies![iamRolePolicyDiff.policyId][0] } };
      } else if (instance instanceof AttachRolePolicyCommand) {
        return;
      } else if (instance instanceof DetachRolePolicyCommand) {
        return;
      } else if (instance instanceof DeletePolicyCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateIamRoleWithS3StoragePolicyResourceAction>(UpdateIamRoleWithS3StoragePolicyResourceAction)
export class UpdateIamRoleWithS3StoragePolicyResourceActionFactory {
  private static instance: UpdateIamRoleWithS3StoragePolicyResourceAction;

  static async create(): Promise<UpdateIamRoleWithS3StoragePolicyResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamRoleWithS3StoragePolicyResourceAction(container);
    }
    return this.instance;
  }
}
