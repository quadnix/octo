import {
  AModule,
  type Account,
  type Execution,
  type MatchingAnchor,
  Module,
  ModuleError,
  type Region,
  type Server,
} from '@quadnix/octo';
import { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { AwsEcsClusterAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import { AwsEcsExecutionAnchor } from '../../../anchors/aws-ecs/aws-ecs-execution.anchor.js';
import { AwsEcsServiceAnchor } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsSecurityGroupAnchor } from '../../../anchors/aws-security-group/aws-security-group.anchor.js';
import { AwsSecurityGroupAnchorSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';
import { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import { TaskDefinitionUtility } from '../../../utilities/task-definition/task-definition.utility.js';
import { AwsEcsExecutionModuleSchema } from './index.schema.js';
import { AwsEcsExecution } from './models/execution/index.js';
import { AwsEcsExecutionOverlay } from './overlays/aws-ecs-execution/index.js';
import { AwsEcsExecutionServerSecurityGroupOverlay } from './overlays/aws-ecs-execution-server-security-group/index.js';

/**
 * `AwsEcsExecutionModule` is an ECS-based AWS execution module that provides an implementation for
 * the `Execution` model. This module creates executions that manage the runtime of containerized applications
 * in ECS environments. It handles main and sidecar deployments, environment variables,
 * security groups, filesystem mounts, and service orchestration.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Deployment, type Environment, type Filesystem, type Subnet, stub } from '@quadnix/octo';
 * import { AwsEcsExecutionModule } from '@quadnix/octo-aws-cdk/modules/execution/aws-ecs-execution';
 *
 * octo.loadModule(AwsEcsExecutionModule, 'my-execution-module', {
 *   deployments: {
 *     main: {
 *       containerProperties: {
 *         cpu: 512,
 *         image: {
 *           essential: true,
 *           name: 'main-app',
 *           ports: [{ containerPort: 3000, protocol: 'tcp' }]
 *         },
 *         memory: 1024,
 *       },
 *       deployment: stub<Deployment>('${{my-deployment-module.model.deployment}}'),
 *     },
 *     sidecars: []
 *   },
 *   desiredCount: 2,
 *   environment: stub<Environment>('${{my-environment-module.model.environment}}'),
 *   environmentVariables: {
 *     LOG_LEVEL: 'info'
 *   },
 *   executionId: 'my-app-execution',
 *   filesystems: [stub<Filesystem>('${{my-filesystem-module.model.filesystem}}')],
 *   securityGroupRules: [{
 *     CidrBlock: '0.0.0.0/0',
 *     Egress: false,
 *     FromPort: 3000,
 *     IpProtocol: 'tcp',
 *     ToPort: 3000,
 *   }],
 *   subnet: stub<Subnet>('${{my-subnet-module.model.subnet}}'),
 * });
 * ```
 *
 * @group Modules/Execution/AwsEcsExecution
 *
 * @reference Resources {@link EcsServiceSchema}
 * @reference Resources {@link EcsTaskDefinitionSchema}
 * @reference Resources {@link SecurityGroupSchema}
 *
 * @see {@link AwsEcsExecutionModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Execution](/api/octo/class/Execution) to learn more about the `Execution` model.
 */
@Module<AwsEcsExecutionModule>('@octo', AwsEcsExecutionModuleSchema)
export class AwsEcsExecutionModule extends AModule<AwsEcsExecutionModuleSchema, Execution> {
  /**
   * Creates the execution, resolves the anchors of its server, deployment, subnet, and any sidecars, and opens the security-group rules between them.
   */
  async onInit(
    inputs: AwsEcsExecutionModuleSchema,
  ): Promise<(AwsEcsExecution | AwsEcsExecutionOverlay | AwsEcsExecutionServerSecurityGroupOverlay)[]> {
    const { deployments, environment, subnet } = inputs;
    const { awsAccountId, awsRegionId, region } = await this.registerMetadata(inputs);

    if (environment.getParents()['region'][0].to.getContext() !== subnet.getParents()['region'][0].to.getContext()) {
      throw new ModuleError('Environment and Subnet must be in the same region!', this.constructor.name);
    }

    // Create a new execution.
    const execution = new AwsEcsExecution(
      inputs.executionId,
      { main: deployments.main.deployment, sidecars: deployments.sidecars.map((d) => d.deployment) },
      environment,
      subnet,
    );
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      execution.environmentVariables.set(key, value);
    }

    const models: (AwsEcsExecution | AwsEcsExecutionOverlay | AwsEcsExecutionServerSecurityGroupOverlay)[] = [
      execution,
    ];

    // Add anchors.
    const ecsExecutionAnchor = new AwsEcsExecutionAnchor(
      'AwsEcsExecutionAnchor',
      {
        desiredCount: inputs.desiredCount,
        environmentVariables: Object.fromEntries(execution.environmentVariables.entries()),
      },
      execution,
    );
    execution.addAnchor(ecsExecutionAnchor);
    const securityGroupAnchor = new AwsSecurityGroupAnchor(
      'AwsSecurityGroupAnchor',
      {
        rules: [],
        securityGroupName: `SecurityGroup-${execution.executionId}`,
      },
      execution,
    );
    execution.addAnchor(securityGroupAnchor);

    // Add security-group rules.
    for (const rule of inputs.securityGroupRules || []) {
      const existingRule = securityGroupAnchor.properties.rules.find(
        (r) =>
          r.CidrBlock === rule.CidrBlock &&
          r.Egress === rule.Egress &&
          r.FromPort === rule.FromPort &&
          r.IpProtocol === rule.IpProtocol &&
          r.ToPort === rule.ToPort,
      );
      if (!existingRule) {
        securityGroupAnchor.properties.rules.push(rule);
      }
    }

    // A security group with no egress rule permits no outbound traffic, and a task has to reach
    // ECR to pull the image it runs. Without this the task stops with
    // "ResourceInitializationError: ... cannot pull registry auth from Amazon ECR" and the
    // execution never starts, so the default is the one AWS gives a security group of its own.
    //
    // Only when the caller declared no egress rule at all. Anyone who declared one has said what
    // this execution may reach, and widening that silently would be worse than the default itself.
    if (!securityGroupAnchor.properties.rules.some((r) => r.Egress)) {
      securityGroupAnchor.properties.rules.push({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 0,
        IpProtocol: '-1',
        ToPort: 0,
      });
    }

    // Get main deployment server's anchors.
    const mainServer = deployments.main.deployment.getParents()['server'][0].to as Server;
    const [matchingMainServerAnchor] = await mainServer.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const [matchingMainSecurityGroupAnchor] = await mainServer.getAnchorsMatchingSchema(
      AwsSecurityGroupAnchorSchema,
      [],
      {
        searchBoundaryMembers: false,
      },
    );
    if (!matchingMainServerAnchor || !matchingMainSecurityGroupAnchor) {
      throw new ModuleError(
        `Server "${mainServer.serverKey}" does not have compatible anchors!`,
        this.constructor.name,
      );
    }

    // Get sidecar deployment servers' anchors, once per server. A sidecar runs as the role holding the
    // main deployment server's grants, so the server of a sidecar must grant nothing of its own.
    const sidecarServers: Server[] = [];
    for (const { deployment } of deployments.sidecars) {
      const server = deployment.getParents()['server'][0].to as Server;
      if (server !== mainServer && !sidecarServers.includes(server)) {
        sidecarServers.push(server);
      }
    }
    const matchingSidecarSecurityGroupAnchors: MatchingAnchor<AwsSecurityGroupAnchorSchema>[] = [];
    for (const server of sidecarServers) {
      const [matchingSidecarServerAnchor] = await server.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const [matchingSidecarSecurityGroupAnchor] = await server.getAnchorsMatchingSchema(
        AwsSecurityGroupAnchorSchema,
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      if (!matchingSidecarServerAnchor || !matchingSidecarSecurityGroupAnchor) {
        throw new ModuleError(`Server "${server.serverKey}" does not have compatible anchors!`, this.constructor.name);
      }

      const { grants: sidecarGrants } = matchingSidecarServerAnchor.getSchemaInstance().properties;
      if (sidecarGrants.dynamodb.length > 0 || sidecarGrants.s3.length > 0) {
        throw new ModuleError(
          `Server "${server.serverKey}" of a sidecar cannot grant anything! A sidecar runs with the grants of server "${mainServer.serverKey}".`,
          this.constructor.name,
        );
      }

      matchingSidecarSecurityGroupAnchors.push(matchingSidecarSecurityGroupAnchor);
    }

    // Get main deployment server's grants, and the anchors of the buckets and tables they name.
    const { grants } = matchingMainServerAnchor.getSchemaInstance().properties;
    const grantAnchors: (
      | MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>
      | MatchingAnchor<AwsDynamoDBAnchorSchema>
    )[] = [];
    for (const grant of grants.s3) {
      const [matchingAccessPrefixAnchor] = await mainServer.getAnchorsMatchingSchema(
        AwsS3StorageServiceAccessPrefixAnchorSchema,
        [
          { key: 'accessPrefix', value: grant.accessPrefix },
          { key: 'bucketName', value: grant.bucketName },
        ],
      );

      // The role is created in this execution's account, and can only be granted a bucket in it.
      const bucket = matchingAccessPrefixAnchor.getActual().getParent();
      const [matchingS3StorageAnchor] = await bucket.getAnchorsMatchingSchema(AwsS3StorageServiceAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const bucketAwsAccountId = matchingS3StorageAnchor.getSchemaInstance().properties.awsAccountId;
      if (bucketAwsAccountId !== awsAccountId) {
        throw new ModuleError(
          `Bucket "${grant.bucketName}" is in account "${bucketAwsAccountId}", not in the execution's account "${awsAccountId}"!`,
          this.constructor.name,
        );
      }

      if (!grantAnchors.some((a) => a.getActual() === matchingAccessPrefixAnchor.getActual())) {
        grantAnchors.push(matchingAccessPrefixAnchor);
      }
    }
    for (const grant of grants.dynamodb) {
      const [matchingDynamoDBAnchor] = await mainServer.getAnchorsMatchingSchema(AwsDynamoDBAnchorSchema, [
        { key: 'TableName', value: grant.tableName },
      ]);

      // The role is created in this execution's account, and can only be granted a table in it.
      const tableAwsAccountId = matchingDynamoDBAnchor.getSchemaInstance().properties.awsAccountId;
      if (tableAwsAccountId !== awsAccountId) {
        throw new ModuleError(
          `Table "${grant.tableName}" is in account "${tableAwsAccountId}", not in the execution's account "${awsAccountId}"!`,
          this.constructor.name,
        );
      }

      if (!grantAnchors.some((a) => a.getActual() === matchingDynamoDBAnchor.getActual())) {
        grantAnchors.push(matchingDynamoDBAnchor);
      }
    }

    // Get each deployment's anchor, the main deployment's first.
    const deploymentPropertiesList: AwsDeploymentAnchorSchema['properties'][] = [];
    for (const { deployment } of [deployments.main, ...deployments.sidecars]) {
      const [matchingDeploymentAnchor] = await deployment.getAnchorsMatchingSchema(AwsDeploymentAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      deploymentPropertiesList.push(matchingDeploymentAnchor.getSchemaInstance().properties);
    }

    // Check the main deployment has what ECS needs.
    const [mainDeploymentProperties] = deploymentPropertiesList;
    const cpu = inputs.deployments.main.containerProperties.cpu || mainDeploymentProperties.cpu;
    const memory = inputs.deployments.main.containerProperties.memory || mainDeploymentProperties.memory;
    if (!cpu || !memory) {
      throw new ModuleError(
        `Deployment "${deployments.main.deployment.deploymentTag}" needs a cpu and a memory to run on ECS!`,
        this.constructor.name,
      );
    }
    if (!TaskDefinitionUtility.isCpuAndMemoryValid(cpu, memory)) {
      throw new ModuleError('Invalid values for CPU and/or memory!', this.constructor.name);
    }

    // Get the image of each deployment, and check it has what ECS needs.
    const imageAnchors: MatchingAnchor<AwsEcrImageAnchorSchema>[] = [];
    const images: AwsEcsExecutionOverlay['properties']['deploymentContainerProperties']['images'] = [];
    for (const [index, { containerProperties, deployment }] of [deployments.main, ...deployments.sidecars].entries()) {
      const deploymentProperties = deploymentPropertiesList[index];

      let uri: string;
      if (deploymentProperties.image.kind === 'ecr') {
        const { imageId, imageTag } = deploymentProperties.image;
        const [matchingImageAnchor] = await deployment.getAnchorsMatchingSchema(AwsEcrImageAnchorSchema, [
          { key: 'imageId', value: imageId },
        ]);
        if (!imageAnchors.some((a) => a.getActual() === matchingImageAnchor.getActual())) {
          imageAnchors.push(matchingImageAnchor);
        }
        uri = `${awsAccountId}.dkr.ecr.${awsRegionId}.amazonaws.com/${imageId}:${imageTag}`;
      } else {
        uri = deploymentProperties.image.uri;
      }

      const command = containerProperties.image.command || deploymentProperties.command;
      if (!command) {
        throw new ModuleError(
          `Deployment "${deployment.deploymentTag}" needs a command to run on ECS!`,
          this.constructor.name,
        );
      }

      images.push({
        command,
        essential: containerProperties.image.essential,
        name: containerProperties.image.name,
        ports: (containerProperties.image.ports || deploymentProperties.ports).map((p) => ({
          containerPort: p.containerPort,
          protocol: p.protocol,
        })),
        uri,
      });
    }

    // Get filesystem anchors.
    const matchingSubnetLocalFilesystemMountAnchors: MatchingAnchor<AwsSubnetLocalFilesystemMountAnchorSchema>[] = [];
    for (const filesystem of inputs.filesystems || []) {
      const [matchingSubnetLocalFilesystemMountAnchor] = await subnet.getAnchorsMatchingSchema(
        AwsSubnetLocalFilesystemMountAnchorSchema,
        [{ key: 'filesystemName', value: filesystem.filesystemName }],
        { searchBoundaryMembers: false },
      );
      if (!matchingSubnetLocalFilesystemMountAnchor) {
        throw new ModuleError('Filesystem not mounted in given subnet!', this.constructor.name);
      }
      matchingSubnetLocalFilesystemMountAnchors.push(matchingSubnetLocalFilesystemMountAnchor);
    }

    // Get environment anchors.
    const [matchingEcsClusterAnchor] = await environment.getAnchorsMatchingSchema(AwsEcsClusterAnchorSchema, [], {
      searchBoundaryMembers: false,
    });

    // Validate the name of the role this execution runs as.
    const iamRoleName = `ExecutionRole-${execution.executionId}`;
    if (iamRoleName.length > 64) {
      throw new ModuleError(`IAM role name "${iamRoleName}" is longer than 64 characters!`, this.constructor.name);
    }

    // Add aws-ecs-execution overlay for container lifecycle.
    const executionOverlayId = `aws-ecs-execution-overlay-${execution.executionId}`;
    const executionOverlay = new AwsEcsExecutionOverlay(
      executionOverlayId,
      {
        deploymentContainerProperties: {
          cpu,
          images,
          memory,
        },
        deploymentTag: deployments.main.deployment.deploymentTag,
        environmentName: environment.environmentName,
        executionId: execution.executionId,
        filesystemNames: (inputs.filesystems || []).map((f) => f.filesystemName),
        grants,
        iamRoleName,
        regionId: region.regionId,
        serverKey: mainServer.serverKey,
        subnetId: subnet.subnetId,
        subnetType: subnet.subnetType,
      },
      [
        ecsExecutionAnchor,
        matchingEcsClusterAnchor,
        securityGroupAnchor,
        ...matchingSubnetLocalFilesystemMountAnchors,
        ...grantAnchors,
        ...imageAnchors,
      ],
    );
    execution.addAnchor(
      new AwsEcsServiceAnchor('AwsEcsServiceAnchor', { executionId: execution.executionId }, executionOverlay),
    );
    models.push(executionOverlay);

    // Add SecurityGroupOverlay for security group lifecycle.
    const securityGroupOverlay = new AwsEcsExecutionServerSecurityGroupOverlay(
      `aws-ecs-execution-server-security-group-overlay-${execution.executionId}`,
      {},
      [matchingMainSecurityGroupAnchor, ...matchingSidecarSecurityGroupAnchors, securityGroupAnchor],
    );
    models.push(securityGroupOverlay);

    // Enforce relationship between security-group overlay and execution,
    // so that execution overlay always executes after security-group overlay.
    securityGroupOverlay.addChild('overlayId', executionOverlay, 'overlayId');

    return models;
  }

  /**
   * Resolves the account, region, and the region model this execution is placed in.
   */
  override async registerMetadata(
    inputs: AwsEcsExecutionModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string; region: Region }> {
    const { environment } = inputs;
    const region = environment.getParents()['region'][0].to as Region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
      region,
    };
  }
}
