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
import { AwsEcsClusterAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import { AwsEcsExecutionAnchor } from '../../../anchors/aws-ecs/aws-ecs-execution.anchor.js';
import { AwsEcsServiceAnchor } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.js';
import { AwsEcsTaskDefinitionAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-task-definition.anchor.schema.js';
import { AwsIamRoleAnchorSchema } from '../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsSecurityGroupAnchor } from '../../../anchors/aws-security-group/aws-security-group.anchor.js';
import { AwsSecurityGroupAnchorSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
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
 * import { AwsEcsExecutionModule } from '@quadnix/octo-aws-cdk/modules/aws-ecs-execution';
 *
 * octo.loadModule(AwsExecutionModule, 'my-execution-module', {
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
 *       deployment: myMainDeployment,
 *     },
 *     sidecars: []
 *   },
 *   desiredCount: 2,
 *   environment: myEnvironment,
 *   environmentVariables: {
 *     LOG_LEVEL: 'info'
 *   },
 *   executionId: 'my-app-execution',
 *   filesystems: [myFilesystem],
 *   securityGroupRules: [{
 *     CidrBlock: '0.0.0.0/0',
 *     Egress: false,
 *     FromPort: 3000,
 *     IpProtocol: 'tcp',
 *     ToPort: 3000,
 *   }],
 *   subnet: mySubnet,
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
 * @see {@link Execution} to learn more about the `Execution` model.
 */
@Module<AwsEcsExecutionModule>('@octo', AwsEcsExecutionModuleSchema)
export class AwsEcsExecutionModule extends AModule<AwsEcsExecutionModuleSchema, Execution> {
  async onInit(
    inputs: AwsEcsExecutionModuleSchema,
  ): Promise<(AwsEcsExecution | AwsEcsExecutionOverlay | AwsEcsExecutionServerSecurityGroupOverlay)[]> {
    const { deployments, environment, subnet } = inputs;
    const { region } = await this.registerMetadata(inputs);

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

    // Get main deployment server's anchors.
    const mainServer = deployments.main.deployment.getParents()['server'][0].to as Server;
    const [matchingMainIamRoleAnchor] = await mainServer.getAnchorsMatchingSchema(AwsIamRoleAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const [matchingMainSecurityGroupAnchor] = await mainServer.getAnchorsMatchingSchema(
      AwsSecurityGroupAnchorSchema,
      [],
      {
        searchBoundaryMembers: false,
      },
    );
    if (!matchingMainIamRoleAnchor || !matchingMainSecurityGroupAnchor) {
      throw new ModuleError(
        `Server "${mainServer.serverKey}" does not have compatible anchors!`,
        this.constructor.name,
      );
    }

    // Get sidecar deployment server's anchors.
    const sidecarServers = deployments.sidecars.map((d) => d.deployment.getParents()['server'][0].to as Server);
    const matchingSidecarSecurityGroupAnchors: MatchingAnchor<AwsSecurityGroupAnchorSchema>[] = [];
    for (const server of sidecarServers) {
      const [matchingSidecarSecurityGroupAnchor] = await server.getAnchorsMatchingSchema(
        AwsSecurityGroupAnchorSchema,
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      if (!matchingSidecarSecurityGroupAnchor) {
        throw new ModuleError(`Server "${server.serverKey}" does not have compatible anchors!`, this.constructor.name);
      }
      matchingSidecarSecurityGroupAnchors.push(matchingSidecarSecurityGroupAnchor);
    }

    // Get main deployment anchors.
    const [matchingMainTaskDefinitionAnchor] = await deployments.main.deployment.getAnchorsMatchingSchema(
      AwsEcsTaskDefinitionAnchorSchema,
      [],
      {
        searchBoundaryMembers: false,
      },
    );

    // Get sidecar deployment anchors.
    const matchingSidecarTaskDefinitionAnchors: MatchingAnchor<AwsEcsTaskDefinitionAnchorSchema>[] = [];
    for (const deployment of deployments.sidecars) {
      const [matchingSidecarTaskDefinitionAnchor] = await deployment.deployment.getAnchorsMatchingSchema(
        AwsEcsTaskDefinitionAnchorSchema,
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      matchingSidecarTaskDefinitionAnchors.push(matchingSidecarTaskDefinitionAnchor);
    }

    // Get environment anchors.
    const [matchingEcsClusterAnchor] = await environment.getAnchorsMatchingSchema(AwsEcsClusterAnchorSchema, [], {
      searchBoundaryMembers: false,
    });

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

    // Add aws-ecs-execution overlay for container lifecycle.
    const executionOverlayId = `aws-ecs-execution-overlay-${execution.executionId}`;
    const executionOverlay = new AwsEcsExecutionOverlay(
      executionOverlayId,
      {
        deploymentContainerProperties: {
          cpu:
            inputs.deployments.main.containerProperties.cpu ||
            matchingMainTaskDefinitionAnchor.getSchemaInstance().properties.cpu,
          images: [
            {
              command: (
                inputs.deployments.main.containerProperties.image.command ||
                matchingMainTaskDefinitionAnchor.getSchemaInstance().properties.image.command
              ).split(' '),
              essential: inputs.deployments.main.containerProperties.image.essential,
              name: inputs.deployments.main.containerProperties.image.name,
              ports: (
                inputs.deployments.main.containerProperties.image.ports ||
                matchingMainTaskDefinitionAnchor.getSchemaInstance().properties.image.ports
              ).map((p) => ({
                containerPort: p.containerPort,
                protocol: p.protocol,
              })),
              uri: matchingMainTaskDefinitionAnchor.getSchemaInstance().properties.image.uri,
            },
            ...inputs.deployments.sidecars.map((deployment) => {
              const matchingSidecarTaskDefinitionAnchor = matchingSidecarTaskDefinitionAnchors.find(
                (a) => a.getActual().getParent().deploymentTag === deployment.deployment.deploymentTag,
              )!;

              return {
                command: (
                  deployment.containerProperties.image.command ||
                  matchingSidecarTaskDefinitionAnchor.getSchemaInstance().properties.image.command
                ).split(' '),
                essential: deployment.containerProperties.image.essential,
                name: deployment.containerProperties.image.name,
                ports: (
                  deployment.containerProperties.image.ports ||
                  matchingSidecarTaskDefinitionAnchor.getSchemaInstance().properties.image.ports
                ).map((p) => ({
                  containerPort: p.containerPort,
                  protocol: p.protocol,
                })),
                uri: matchingSidecarTaskDefinitionAnchor.getSchemaInstance().properties.image.uri,
              };
            }),
          ],
          memory:
            inputs.deployments.main.containerProperties.memory ||
            matchingMainTaskDefinitionAnchor.getSchemaInstance().properties.memory,
        },
        deploymentTag: deployments.main.deployment.deploymentTag,
        environmentName: environment.environmentName,
        executionId: execution.executionId,
        regionId: region.regionId,
        serverKey: mainServer.serverKey,
        subnetId: subnet.subnetId,
        subnetType: subnet.subnetType,
      },
      [
        matchingMainIamRoleAnchor,
        ecsExecutionAnchor,
        matchingEcsClusterAnchor,
        securityGroupAnchor,
        ...matchingSubnetLocalFilesystemMountAnchors,
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
