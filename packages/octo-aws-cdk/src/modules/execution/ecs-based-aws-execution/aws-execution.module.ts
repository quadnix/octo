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
    const { deployment, environment, subnet } = inputs;
    const { region, server } = await this.registerMetadata(inputs);

    if (environment.getParents()['region'][0].to.getContext() !== subnet.getParents()['region'][0].to.getContext()) {
      throw new Error('Environment and Subnet must be in the same region!');
    }

    // Create a new execution.
    const execution = new AwsExecution(deployment, environment, subnet);
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

    const [matchingIamRoleAnchor] = await server.getAnchorsMatchingSchema(IamRoleAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const [matchingSecurityGroupAnchor] = await server.getAnchorsMatchingSchema(SecurityGroupAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    if (!matchingIamRoleAnchor || !matchingSecurityGroupAnchor) {
      throw new Error('Deployment does not belong to a compatible server!');
    }

    const [matchingTaskDefinitionAnchor] = await deployment.getAnchorsMatchingSchema(
      EcsTaskDefinitionAnchorSchema,
      [],
      {
        searchBoundaryMembers: false,
      },
    );
    const [matchingEcsClusterAnchor] = await environment.getAnchorsMatchingSchema(EcsClusterAnchorSchema, [], {
      searchBoundaryMembers: false,
    });

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
        deploymentTag: deployment.deploymentTag,
        environmentName: environment.environmentName,
        executionId: execution.executionId,
        regionId: region.regionId,
        serverKey: server.serverKey,
        subnetId: subnet.subnetId,
      },
      [
        matchingIamRoleAnchor,
        matchingTaskDefinitionAnchor,
        ecsServiceAnchor,
        ecsExecutionAnchor,
        matchingEcsClusterAnchor,
        securityGroupAnchor,
        matchingSecurityGroupAnchor,
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
      [matchingSecurityGroupAnchor, securityGroupAnchor],
    );
    models.push(securityGroupOverlay);

    // Enforce relationship between security-group overlay and execution,
    // so that execution overlay always executes after security-group overlay.
    securityGroupOverlay.addChild('overlayId', executionOverlay, 'overlayId');

    return models;
  }

  override async registerMetadata(
    inputs: AwsExecutionModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string; region: Region; server: Server }> {
    const { deployment, environment } = inputs;
    const region = environment.getParents()['region'][0].to as Region;
    const account = region.getParents()['account'][0].to as Account;
    const server = deployment.getParents()['server'][0].to as Server;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
      region,
      server,
    };
  }
}
