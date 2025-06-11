import { AModule, type Account, type MatchingAnchor, Module, type Region, type Server } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EcsClusterAnchorSchema } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.schema.js';
import { EcsExecutionAnchor } from '../../../anchors/ecs-execution/ecs-execution.anchor.js';
import { EcsServiceAnchor } from '../../../anchors/ecs-service/ecs-service.anchor.js';
import { EcsTaskDefinitionAnchorSchema } from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import { IamRoleAnchorSchema } from '../../../anchors/iam-role/iam-role.anchor.schema.js';
import { SecurityGroupAnchor } from '../../../anchors/security-group/security-group.anchor.js';
import { SecurityGroupAnchorSchema } from '../../../anchors/security-group/security-group.anchor.schema.js';
import { SubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.schema.js';
import { AwsSubnetLocalFilesystemMountSchema } from '../../subnet/simple-aws-subnet/index.schema.js';
import { AwsExecutionModuleSchema } from './index.schema.js';
import { AwsExecution } from './models/execution/index.js';
import { AwsExecutionOverlay } from './overlays/execution/index.js';
import { ServerExecutionSecurityGroupOverlay } from './overlays/server-execution-security-group/index.js';

@Module<AwsExecutionModule>('@octo', AwsExecutionModuleSchema)
export class AwsExecutionModule extends AModule<AwsExecutionModuleSchema, AwsExecution> {
  async onInit(
    inputs: AwsExecutionModuleSchema,
  ): Promise<(AwsExecution | AwsExecutionOverlay | ServerExecutionSecurityGroupOverlay)[]> {
    const { deployments, environment, subnet } = inputs;
    const { region } = await this.registerMetadata(inputs);

    if (environment.getParents()['region'][0].to.getContext() !== subnet.getParents()['region'][0].to.getContext()) {
      throw new Error('Environment and Subnet must be in the same region!');
    }

    // Create a new execution.
    const execution = new AwsExecution(
      inputs.executionId,
      { main: deployments.main.deployment, sidecars: deployments.sidecars.map((d) => d.deployment) },
      environment,
      subnet,
    );
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      execution.environmentVariables.set(key, value);
    }

    const models: (AwsExecution | AwsExecutionOverlay | ServerExecutionSecurityGroupOverlay)[] = [execution];

    // Add anchors.
    const ecsServiceAnchor = new EcsServiceAnchor('EcsServiceAnchor', { desiredCount: inputs.desiredCount }, execution);
    execution.addAnchor(ecsServiceAnchor);
    const ecsExecutionAnchor = new EcsExecutionAnchor(
      'EcsExecutionAnchor',
      { environmentVariables: Object.fromEntries(execution.environmentVariables.entries()) },
      execution,
    );
    execution.addAnchor(ecsExecutionAnchor);
    const securityGroupAnchor = new SecurityGroupAnchor(
      'SecurityGroupAnchor',
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
    const [matchingMainIamRoleAnchor] = await mainServer.getAnchorsMatchingSchema(IamRoleAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const [matchingMainSecurityGroupAnchor] = await mainServer.getAnchorsMatchingSchema(SecurityGroupAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    if (!matchingMainIamRoleAnchor || !matchingMainSecurityGroupAnchor) {
      throw new Error(`Server "${mainServer.serverKey}" does not have compatible anchors!`);
    }

    // Get sidecar deployment server's anchors.
    const sidecarServers = deployments.sidecars.map((d) => d.deployment.getParents()['server'][0].to as Server);
    const matchingSidecarSecurityGroupAnchors: MatchingAnchor<SecurityGroupAnchorSchema>[] = [];
    for (const server of sidecarServers) {
      const [matchingSidecarSecurityGroupAnchor] = await server.getAnchorsMatchingSchema(
        SecurityGroupAnchorSchema,
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      if (!matchingSidecarSecurityGroupAnchor) {
        throw new Error(`Server "${server.serverKey}" does not have compatible anchors!`);
      }
      matchingSidecarSecurityGroupAnchors.push(matchingSidecarSecurityGroupAnchor);
    }

    // Get main deployment anchors.
    const [matchingMainTaskDefinitionAnchor] = await deployments.main.deployment.getAnchorsMatchingSchema(
      EcsTaskDefinitionAnchorSchema,
      [],
      {
        searchBoundaryMembers: false,
      },
    );

    // Get sidecar deployment anchors.
    const matchingSidecarTaskDefinitionAnchors: MatchingAnchor<EcsTaskDefinitionAnchorSchema>[] = [];
    for (const deployment of deployments.sidecars) {
      const [matchingSidecarTaskDefinitionAnchor] = await deployment.deployment.getAnchorsMatchingSchema(
        EcsTaskDefinitionAnchorSchema,
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      matchingSidecarTaskDefinitionAnchors.push(matchingSidecarTaskDefinitionAnchor);
    }

    // Get environment anchors.
    const [matchingEcsClusterAnchor] = await environment.getAnchorsMatchingSchema(EcsClusterAnchorSchema, [], {
      searchBoundaryMembers: false,
    });

    // Get filesystem anchors.
    const matchingSubnetLocalFilesystemMountAnchors: MatchingAnchor<SubnetLocalFilesystemMountAnchorSchema>[] = [];
    for (const filesystem of inputs.filesystems || []) {
      const [matchingSubnetLocalFilesystemMountAnchor] = await subnet.getAnchorsMatchingSchema(
        SubnetLocalFilesystemMountAnchorSchema,
        [{ key: 'filesystemName', value: filesystem.filesystemName }],
        { searchBoundaryMembers: false },
      );
      if (!matchingSubnetLocalFilesystemMountAnchor) {
        throw new Error('Filesystem not mounted in given subnet!');
      }
      matchingSubnetLocalFilesystemMountAnchors.push(matchingSubnetLocalFilesystemMountAnchor);
    }

    // Add execution overlay for container lifecycle.
    const executionOverlayId = `execution-overlay-${execution.executionId}`;
    const executionOverlay = new AwsExecutionOverlay(
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
        ecsServiceAnchor,
        ecsExecutionAnchor,
        matchingEcsClusterAnchor,
        securityGroupAnchor,
        ...matchingSubnetLocalFilesystemMountAnchors,
      ],
    );
    models.push(executionOverlay);

    // Enforce relationship between filesystem overlay and execution,
    // so that execution overlay always executes after filesystem overlay.
    for (const matchingSubnetLocalFilesystemMountAnchor of matchingSubnetLocalFilesystemMountAnchors) {
      const [subnetLocalFilesystemMountOverlay] = await subnet.getOverlaysMatchingSchema(
        AwsSubnetLocalFilesystemMountSchema,
        [
          {
            key: 'filesystemName',
            value: matchingSubnetLocalFilesystemMountAnchor.getSchemaInstance().properties.filesystemName,
          },
        ],
      );
      subnetLocalFilesystemMountOverlay.getActual().addChild('overlayId', executionOverlay, 'overlayId');
    }

    // Add SecurityGroupOverlay for security group lifecycle.
    const securityGroupOverlay = new ServerExecutionSecurityGroupOverlay(
      `server-execution-security-group-overlay-${execution.executionId}`,
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
    inputs: AwsExecutionModuleSchema,
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
