import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  type GetRoleCommandOutput,
  IAMClient,
  ListAttachedRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import { IamRole } from '../iam-role.resource.js';
import type { IIamRoleS3BucketPolicy } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class ValidateIamRoleResourceAction extends ANodeAction implements IResourceAction<IamRole> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof IamRole &&
      hasNodeName(diff.node, 'iam-role') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<IamRole>): Promise<void> {
    // Get properties.
    const iamRole = diff.node;
    const properties = iamRole.properties;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Check if IAM Role exists.
    let getRoleResult: GetRoleCommandOutput | undefined;
    try {
      getRoleResult = await iamClient.send(
        new GetRoleCommand({
          RoleName: response.RoleName!,
        }),
      );
    } catch (error: any) {
      if (error.name === 'NoSuchEntity') {
        throw new TransactionError(`IAM Role with name ${response.RoleName} does not exist!`);
      }
      throw error;
    }

    const actualRole = getRoleResult.Role!;

    // Validate role name.
    if (actualRole.RoleName !== properties.rolename) {
      throw new TransactionError(
        `IAM Role name mismatch. Expected: ${properties.rolename}, Actual: ${actualRole.RoleName || 'undefined'}`,
      );
    }

    // Validate role ID.
    if (actualRole.RoleId !== response.RoleId) {
      throw new TransactionError(
        `IAM Role ID mismatch. Expected: ${response.RoleId}, Actual: ${actualRole.RoleId || 'undefined'}`,
      );
    }

    // Validate role ARN.
    if (actualRole.Arn !== response.Arn) {
      throw new TransactionError(
        `IAM Role ARN mismatch. Expected: ${response.Arn}, Actual: ${actualRole.Arn || 'undefined'}`,
      );
    }

    // Validate ARN format (account should match).
    const expectedArnPrefix = `arn:aws:iam::${properties.awsAccountId}:role/`;
    if (!response.Arn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `IAM Role ARN account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.Arn}`,
      );
    }

    // Validate assume role policy (trust policy).
    const assumeRolePolicyDocument = JSON.parse(decodeURIComponent(actualRole.AssumeRolePolicyDocument!));
    const assumeRolePolicies = properties.policies.filter((p) => p.policyType === 'assume-role-policy');

    const expectedStatements: { Action: string; Effect: 'Allow'; Principal: { Service: string } }[] = [];
    for (const policy of assumeRolePolicies) {
      if (policy.policy === 'ecs-tasks.amazonaws.com') {
        expectedStatements.push({
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ecs-tasks.amazonaws.com',
          },
        });
      }
    }

    if (assumeRolePolicyDocument.Statement?.length !== expectedStatements.length) {
      throw new TransactionError(
        `IAM Role assume role policy statement count mismatch. Expected: ${expectedStatements.length}, Actual: ${assumeRolePolicyDocument.Statement?.length || 0}`,
      );
    }

    for (const expectedStatement of expectedStatements) {
      const matchingStatement = assumeRolePolicyDocument.Statement?.find(
        (statement: any) =>
          statement.Action === expectedStatement.Action &&
          statement.Effect === expectedStatement.Effect &&
          JSON.stringify(statement.Principal) === JSON.stringify(expectedStatement.Principal),
      );

      if (!matchingStatement) {
        throw new TransactionError(
          `IAM Role assume role policy missing statement for service: ${expectedStatement.Principal.Service}`,
        );
      }
    }

    // Validate attached policies.
    const listAttachedPoliciesResult = await iamClient.send(
      new ListAttachedRolePoliciesCommand({
        RoleName: response.RoleName,
      }),
    );

    const attachedPolicies = listAttachedPoliciesResult.AttachedPolicies || [];
    const expectedPolicyArns = new Set<string>();

    // Collect all expected policy ARNs from response.
    if (response.policies) {
      for (const policyArns of Object.values(response.policies)) {
        for (const arn of policyArns) {
          expectedPolicyArns.add(arn);
        }
      }
    }

    // Validate policy count matches.
    if (attachedPolicies.length !== expectedPolicyArns.size) {
      throw new TransactionError(
        `IAM Role attached policy count mismatch. Expected: ${expectedPolicyArns.size}, Actual: ${attachedPolicies.length}`,
      );
    }

    // Validate each expected policy is attached.
    for (const expectedArn of expectedPolicyArns) {
      const attachedPolicy = attachedPolicies.find((p) => p.PolicyArn === expectedArn);
      if (!attachedPolicy) {
        throw new TransactionError(
          `IAM Role missing attached policy: ${expectedArn}. Current policies: ${JSON.stringify(attachedPolicies.map((p) => p.PolicyArn))}`,
        );
      }
    }

    // Validate S3 storage access policies in detail.
    const s3StoragePolicies = properties.policies.filter((p) => p.policyType === 's3-storage-access-policy');
    for (const s3Policy of s3StoragePolicies) {
      const policyArns = response.policies?.[s3Policy.policyId];
      if (!policyArns || policyArns.length === 0) {
        throw new TransactionError(`IAM Role response missing policy ARN for S3 storage policy: ${s3Policy.policyId}`);
      }

      const policyArn = policyArns[0];

      // Get policy version.
      const getPolicyResult = await iamClient.send(
        new GetPolicyCommand({
          PolicyArn: policyArn,
        }),
      );

      const policyVersion = getPolicyResult.Policy!.DefaultVersionId!;

      // Get policy document.
      const getPolicyVersionResult = await iamClient.send(
        new GetPolicyVersionCommand({
          PolicyArn: policyArn,
          VersionId: policyVersion,
        }),
      );

      const policyDocument = JSON.parse(decodeURIComponent(getPolicyVersionResult.PolicyVersion!.Document!));
      const policy = s3Policy.policy as IIamRoleS3BucketPolicy;

      // Validate policy statements.
      const expectedS3Statements: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];

      if (policy.allowRead) {
        expectedS3Statements.push({
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
          Sid: PolicyUtility.getSafeSid(`Allow read from bucket ${policy.bucketName}`),
        });
      }

      if (policy.allowWrite) {
        expectedS3Statements.push({
          Action: ['s3:PutObject', 's3:DeleteObjectVersion', 's3:DeleteObject'],
          Effect: 'Allow',
          Resource:
            policy.remoteDirectoryPath === '' || policy.remoteDirectoryPath === '/'
              ? [`arn:aws:s3:::${policy.bucketName}`, `arn:aws:s3:::${policy.bucketName}/*`]
              : [`arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}/*`],
          Sid: PolicyUtility.getSafeSid(`Allow write from bucket ${policy.bucketName}`),
        });
      }

      if (policyDocument.Statement?.length !== expectedS3Statements.length) {
        throw new TransactionError(
          `S3 storage policy ${s3Policy.policyId} statement count mismatch. Expected: ${expectedS3Statements.length}, Actual: ${policyDocument.Statement?.length || 0}`,
        );
      }

      for (const expectedStatement of expectedS3Statements) {
        const matchingStatement = policyDocument.Statement?.find(
          (statement: any) =>
            statement.Sid === expectedStatement.Sid &&
            statement.Effect === expectedStatement.Effect &&
            JSON.stringify(statement.Action) === JSON.stringify(expectedStatement.Action) &&
            JSON.stringify(statement.Resource) === JSON.stringify(expectedStatement.Resource),
        );

        if (!matchingStatement) {
          throw new TransactionError(
            `S3 storage policy ${s3Policy.policyId} missing statement with Sid: ${expectedStatement.Sid}`,
          );
        }
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateIamRoleResourceAction>(ValidateIamRoleResourceAction)
export class ValidateIamRoleResourceActionFactory {
  private static instance: ValidateIamRoleResourceAction;

  static async create(): Promise<ValidateIamRoleResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateIamRoleResourceAction();
    }
    return this.instance;
  }
}
