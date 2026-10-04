import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  type Execution,
  Factory,
  type IModelAction,
  type Image,
  MatchingAnchor,
  MatchingResource,
  OverlayActionExceptionTransactionError,
  StringUtility,
  SubnetType,
  hasNodeName,
} from '@quadnix/octo';
import { AwsDynamoDBAnchorSchema } from '../../../../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsEfsAnchorSchema } from '../../../../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import { DynamoDBSchema } from '../../../../../../resources/dynamodb/index.schema.js';
import { EcrImageTagSchema } from '../../../../../../resources/ecr-image-tag/index.schema.js';
import { EcsClusterSchema } from '../../../../../../resources/ecs-cluster/index.schema.js';
import { EcsService } from '../../../../../../resources/ecs-service/index.js';
import { EcsTaskDefinition } from '../../../../../../resources/ecs-task-definition/index.js';
import { EfsSchema } from '../../../../../../resources/efs/index.schema.js';
import { IamRole } from '../../../../../../resources/iam-role/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/index.schema.js';
import { SecurityGroupSchema } from '../../../../../../resources/security-group/index.schema.js';
import { SubnetSchema } from '../../../../../../resources/subnet/index.schema.js';
import { EcrImageUriUtility } from '../../../../../../utilities/ecr-image-uri/ecr-image-uri.utility.js';
import type { AwsEcsExecutionModule } from '../../../aws-ecs-execution.module.js';
import { AwsEcsExecutionOverlay } from '../aws-ecs-execution.overlay.js';

/**
 * @internal
 */
@Action(AwsEcsExecutionOverlay)
export class AddAwsEcsExecutionOverlayAction implements IModelAction<AwsEcsExecutionModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsExecutionOverlay &&
      hasNodeName(diff.node, 'aws-ecs-execution-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsEcsExecutionOverlay>,
    actionInputs: EnhancedModuleSchema<AwsEcsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const awsExecutionOverlay = diff.node;
    const properties = awsExecutionOverlay.properties;

    const subnet = actionInputs.inputs.subnet;
    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const [ecsExecutionAnchor, matchingEcsClusterAnchor, securityGroupAnchor] = awsExecutionOverlay.anchors;

    const ecsClusterAnchorProperties = matchingEcsClusterAnchor.getSchemaInstance().properties;

    // Calculate final environment variables.
    const environmentVariables: { name: string; value: string }[] = Object.keys(
      ecsClusterAnchorProperties.environmentVariables,
    ).map((key) => ({
      name: key,
      value: ecsClusterAnchorProperties.environmentVariables[key],
    }));
    for (const key of Object.keys(ecsExecutionAnchor.properties.environmentVariables)) {
      const value = ecsExecutionAnchor.properties.environmentVariables[key];
      const keyIndex = environmentVariables.findIndex((e) => e.name === key);
      if (keyIndex !== -1) {
        environmentVariables[keyIndex].value = value;
      } else {
        environmentVariables.push({ name: key, value });
      }
    }

    // Create IAM Role.
    const iamRole = new IamRole(`iam-role-${properties.iamRoleName}`, {
      awsAccountId,
      policies: [
        {
          policy: 'ecs-tasks.amazonaws.com',
          policyId: 'AmazonECSTasksAssumeRolePolicy',
          policyType: 'assume-role-policy',
        },
        {
          policy: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
          policyId: 'AmazonECSTaskExecutionRolePolicy',
          policyType: 'aws-policy',
        },
      ],
      rolename: properties.iamRoleName,
    });

    // Grant the role each bucket prefix, and admit the role to each bucket. A bucket is found through
    // the access prefix anchor this overlay joins.
    for (const grant of properties.grants.s3) {
      const [matchingAccessPrefixAnchor] = await awsExecutionOverlay.getAnchorsMatchingSchema(
        AwsS3StorageServiceAccessPrefixAnchorSchema,
        [
          { key: 'accessPrefix', value: grant.accessPrefix },
          { key: 'bucketName', value: grant.bucketName },
        ],
        { searchBoundaryMembers: false },
      );
      const [matchingS3StorageResource] = matchingAccessPrefixAnchor
        ? await matchingAccessPrefixAnchor
            .getActual()
            .getParent()
            .getResourcesMatchingSchema(S3StorageSchema, [], [], { searchBoundaryMembers: false })
        : [];
      if (!matchingS3StorageResource) {
        throw new OverlayActionExceptionTransactionError(
          `Bucket "${grant.bucketName}" not found!`,
          diff,
          this.constructor.name,
        );
      }

      const policyId = `${properties.iamRoleName}-${StringUtility.deterministicHash([grant.bucketName, grant.accessPrefix]).substring(0, 12)}`;
      iamRole.addS3BucketPolicy(policyId, matchingS3StorageResource, grant.accessPrefix, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
      });

      const s3Storage = matchingS3StorageResource.getActual() as S3Storage;
      s3Storage.addPermission(new MatchingResource(iamRole), grant.accessPrefix, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
        principalType: 'aws',
      });
      actionOutputs[s3Storage.resourceId] = s3Storage;
    }

    // Grant the role each table. A table is found through the table anchor this overlay joins.
    for (const grant of properties.grants.dynamodb) {
      const [matchingDynamoDBAnchor] = await awsExecutionOverlay.getAnchorsMatchingSchema(
        AwsDynamoDBAnchorSchema,
        [
          { key: 'awsRegionId', value: grant.awsRegionId },
          { key: 'TableName', value: grant.tableName },
        ],
        { searchBoundaryMembers: false },
      );
      const [matchingDynamoDBResource] = matchingDynamoDBAnchor
        ? await matchingDynamoDBAnchor
            .getActual()
            .getParent()
            .getResourcesMatchingSchema(DynamoDBSchema, [], [], { searchBoundaryMembers: false })
        : [];
      if (!matchingDynamoDBResource) {
        throw new OverlayActionExceptionTransactionError(
          `Table "${grant.tableName}" not found in "${grant.awsRegionId}"!`,
          diff,
          this.constructor.name,
        );
      }

      const policyId = `${properties.iamRoleName}-${StringUtility.deterministicHash([grant.awsRegionId, grant.tableName]).substring(0, 12)}`;
      iamRole.addDynamoDBTablePolicy(policyId, matchingDynamoDBResource, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
      });
    }

    // Get matching EFS resources, each through the mount anchor this overlay joins and the filesystem
    // anchor that mount joins.
    const efsList: MatchingResource<EfsSchema>[] = [];
    for (const filesystemName of properties.filesystemNames) {
      const [matchingMountAnchor] = await awsExecutionOverlay.getAnchorsMatchingSchema(
        AwsSubnetLocalFilesystemMountAnchorSchema,
        [{ key: 'filesystemName', value: filesystemName }],
        { searchBoundaryMembers: false },
      );
      const [matchingEfsAnchor] = matchingMountAnchor
        ? await matchingMountAnchor
            .getActual()
            .getParent()
            .getAnchorsMatchingSchema(AwsEfsAnchorSchema, [], { searchBoundaryMembers: false })
        : [];
      const [matchingEfsResource] = matchingEfsAnchor
        ? await matchingEfsAnchor
            .getActual()
            .getParent()
            .getResourcesMatchingSchema(EfsSchema, [], [], { searchBoundaryMembers: false })
        : [];
      if (!matchingEfsResource) {
        throw new OverlayActionExceptionTransactionError(
          `Filesystem "${filesystemName}" not found in "${awsRegionId}"!`,
          diff,
          this.constructor.name,
        );
      }

      efsList.push(matchingEfsResource);
    }

    // Get the published images this task definition runs, so that none of them can be deleted while
    // it still names them. A tag is found through the image it is published into, which the deployment
    // links to, and must be published where the task runs. An image octo did not publish has no
    // resource to match, and is skipped.
    const imageModels = awsExecutionOverlay.anchors
      .map((a) => (a instanceof MatchingAnchor ? a.getActual().getParent() : a.getParent()))
      .filter((m) => hasNodeName(m, 'image')) as Image[];
    const ecrImageTagList: MatchingResource<EcrImageTagSchema>[] = [];
    for (const image of properties.deploymentContainerProperties.images) {
      const imageReference = EcrImageUriUtility.parse(image.uri);
      if (!imageReference) {
        continue;
      }

      const linkedImage = imageModels.find((m) => m.imageId === imageReference.imageId);
      const [matchingEcrImageTagResource] = await (linkedImage ?? awsExecutionOverlay).getResourcesMatchingSchema(
        EcrImageTagSchema,
        [
          { key: 'awsAccountId', value: imageReference.awsAccountId },
          { key: 'awsRegionId', value: imageReference.awsRegionId },
          { key: 'imageId', value: imageReference.imageId },
          { key: 'imageTag', value: imageReference.imageTag },
        ],
      );
      if (matchingEcrImageTagResource) {
        ecrImageTagList.push(matchingEcrImageTagResource);
      } else if (linkedImage) {
        throw new OverlayActionExceptionTransactionError(
          `Image "${imageReference.imageId}:${imageReference.imageTag}" is not published in "${imageReference.awsRegionId}"!`,
          diff,
          this.constructor.name,
        );
      }
    }

    // Run the task on the processor its published images were built for. An image octo did not
    // publish carries no processor, and leaves ECS's default.
    const architectures = [...new Set(ecrImageTagList.map((t) => t.getSchemaInstance().properties.architecture))];
    if (architectures.length > 1) {
      throw new OverlayActionExceptionTransactionError(
        `Images of execution "${properties.executionId}" are built for different processors!`,
        diff,
        this.constructor.name,
      );
    }

    // Create ECS Task Definition.
    const ecsTaskDefinition = new EcsTaskDefinition(
      `ecs-task-definition-${properties.executionId}`,
      {
        architecture: architectures[0] ?? 'x86_64',
        awsAccountId,
        awsRegionId,
        cpu: properties.deploymentContainerProperties.cpu,
        deploymentTag: properties.deploymentTag,
        environmentVariables,
        family: properties.executionId,
        images: properties.deploymentContainerProperties.images,
        memory: properties.deploymentContainerProperties.memory,
      },
      [new MatchingResource(iamRole), ...ecrImageTagList, ...efsList],
    );

    // Get matching ECS Cluster resource, from the environment the cluster anchor belongs to.
    const [matchingEcsClusterResource] = await matchingEcsClusterAnchor
      .getActual()
      .getParent()
      .getResourcesMatchingSchema(EcsClusterSchema, [], [], { searchBoundaryMembers: false });
    if (!matchingEcsClusterResource) {
      throw new OverlayActionExceptionTransactionError(
        `ECS Cluster "${ecsClusterAnchorProperties.clusterName}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    // Get matching Subnet resource, from the subnet itself.
    const [matchingSubnetResource] = await subnet.getResourcesMatchingSchema(SubnetSchema, [], [], {
      searchBoundaryMembers: false,
    });
    if (!matchingSubnetResource) {
      throw new OverlayActionExceptionTransactionError(
        `Subnet "${subnet.subnetName}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    // Get matching execution's SecurityGroup resource, holding the rules of every server it runs.
    const execution = securityGroupAnchor.getParent() as Execution;
    const [matchingExecutionSGResource] = await execution.getResourcesMatchingSchema(SecurityGroupSchema, [], [], {
      searchBoundaryMembers: false,
    });
    if (!matchingExecutionSGResource) {
      throw new OverlayActionExceptionTransactionError(
        `Security group of execution "${properties.executionId}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    // Create ECS Service.
    const ecsService = new EcsService(
      `ecs-service-${properties.executionId}`,
      {
        assignPublicIp: properties.subnetType === SubnetType.PUBLIC ? 'ENABLED' : 'DISABLED',
        awsAccountId,
        awsRegionId,
        desiredCount: ecsExecutionAnchor.properties.desiredCount,
        loadBalancers: [],
        serviceName: properties.executionId.replace(/\./g, '_'),
      },
      [
        matchingEcsClusterResource,
        new MatchingResource(ecsTaskDefinition),
        matchingSubnetResource,
        matchingExecutionSGResource,
      ],
    );

    actionOutputs[iamRole.resourceId] = iamRole;

    actionOutputs[ecsTaskDefinition.resourceId] = ecsTaskDefinition;

    actionOutputs[ecsService.resourceId] = ecsService;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsExecutionOverlayAction>(AddAwsEcsExecutionOverlayAction)
export class AddAwsEcsExecutionOverlayActionFactory {
  private static instance: AddAwsEcsExecutionOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsEcsExecutionOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsExecutionOverlayAction();
    }
    return this.instance;
  }
}
