import { Container, Diff, Execution, Model, OverlayService } from '@quadnix/octo';
import { EcsServiceAnchor } from '../../anchors/ecs-service.anchor.js';
import { EnvironmentVariablesAnchor } from '../../anchors/environment-variables.anchor.js';
import { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
import { ExecutionOverlay } from '../../overlays/execution/execution.overlay.js';
import { SecurityGroupOverlay } from '../../overlays/security-group/security-group.overlay.js';
import type { AwsDeployment } from '../deployment/aws.deployment.model.js';
import type { AwsEnvironment } from '../environment/aws.environment.model.js';
import type { AwsRegion } from '../region/aws.region.model.js';
import type { AwsServer } from '../server/aws.server.model.js';
import type { AwsSubnet } from '../subnet/aws.subnet.model.js';

@Model()
export class AwsExecution extends Execution {
  constructor(deployment: AwsDeployment, environment: AwsEnvironment, subnet: AwsSubnet) {
    super(deployment, environment, subnet);

    this.anchors.push(new EcsServiceAnchor('EcsServiceAnchor', { desiredCount: 1 }, this));
    this.anchors.push(new EnvironmentVariablesAnchor('EnvironmentVariablesAnchor', {}, this));
    this.anchors.push(
      new SecurityGroupAnchor(
        'SecurityGroupAnchor',
        { rules: [], securityGroupName: `${this.executionId}-SecurityGroup` },
        this,
      ),
    );
  }

  addSecurityGroupRule(rule: SecurityGroupAnchor['properties']['rules'][0]): void {
    const securityGroupAnchor = this.anchors.find((a) => a instanceof SecurityGroupAnchor) as SecurityGroupAnchor;

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

  override async diff(): Promise<Diff[]> {
    // Skip diff of environmentVariables, since its done in ExecutionOverlay.
    return [];
  }

  getSecurityGroupRules(): SecurityGroupAnchor['properties']['rules'] {
    const securityGroupAnchor = this.anchors.find((a) => a instanceof SecurityGroupAnchor) as SecurityGroupAnchor;

    return securityGroupAnchor.properties.rules;
  }

  async init(): Promise<void> {
    const overlayService = await Container.get(OverlayService);
    const parents = this.getParents();

    const deployment = parents['deployment'][0].to as AwsDeployment;
    const server = deployment.getParents()['server'][0].to as AwsServer;
    const environment = parents['environment'][0].to as AwsEnvironment;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const subnet = parents['subnet'][0].to as AwsSubnet;

    // ECS Service Anchors.
    const ecsServiceAnchor = this.getAnchors().find((a) => a instanceof EcsServiceAnchor) as EcsServiceAnchor;

    // ECS TaskDefinition Anchors.
    const taskDefinitionAnchor = deployment
      .getAnchors()
      .find((a) => a instanceof TaskDefinitionAnchor) as TaskDefinitionAnchor;

    // Environment Variables Anchors.
    const environmentEVAnchor = environment
      .getAnchors()
      .find((a) => a instanceof EnvironmentVariablesAnchor) as EnvironmentVariablesAnchor;
    const executionEVAnchor = this.getAnchors().find(
      (a) => a instanceof EnvironmentVariablesAnchor,
    ) as EnvironmentVariablesAnchor;

    // IAM Role Anchors.
    const serverIamRoleAnchor = server.getAnchors().find((a) => a instanceof IamRoleAnchor) as IamRoleAnchor;

    // Security Group Anchors.
    const executionSecurityGroupAnchor = this.anchors.find(
      (a) => a instanceof SecurityGroupAnchor,
    ) as SecurityGroupAnchor;
    const serverSecurityGroupAnchor = server
      .getAnchors()
      .find((a) => a instanceof SecurityGroupAnchor) as SecurityGroupAnchor;

    // Add ServerExecutionSecurityGroupOverlay.
    const securityGroupOverlayId = `security-group-overlay-${this.executionId}`;
    const serverExecutionSecurityGroupOverlay = new SecurityGroupOverlay(
      securityGroupOverlayId,
      {
        awsRegionId: region.awsRegionId,
        regionId: region.regionId,
      },
      [serverSecurityGroupAnchor, executionSecurityGroupAnchor],
    );
    overlayService.addOverlay(serverExecutionSecurityGroupOverlay);

    // Add ExecutionOverlay.
    const executionOverlayId = `execution-overlay-${this.executionId}`;
    const executionOverlay = new ExecutionOverlay(
      executionOverlayId,
      {
        awsRegionId: region.awsRegionId,
        deploymentTag: deployment.deploymentTag,
        environmentName: environment.environmentName,
        regionId: region.regionId,
        serverKey: server.serverKey,
        subnetId: subnet.subnetId,
      },
      [
        serverIamRoleAnchor,
        taskDefinitionAnchor,
        ecsServiceAnchor,
        executionEVAnchor,
        environmentEVAnchor,
        executionSecurityGroupAnchor,
        serverSecurityGroupAnchor,
      ],
    );
    overlayService.addOverlay(executionOverlay);
  }

  async mountFilesystem(filesystemName: string): Promise<void> {
    const overlayService = await Container.get(OverlayService);
    const parents = this.getParents();

    const subnet = parents['subnet'][0].to as AwsSubnet;

    const filesystemMount = subnet.filesystemMounts.find((f) => f.filesystemName === filesystemName);
    if (!filesystemMount) {
      throw new Error('Filesystem not found in AWS subnet!');
    }
    const subnetFilesystemMountAnchor = subnet.getAnchor(
      filesystemMount.filesystemMountAnchorName,
    ) as SubnetFilesystemMountAnchor;

    const executionOverlayId = `execution-overlay-${this.executionId}`;
    const executionOverlay = overlayService.getOverlayById(executionOverlayId) as ExecutionOverlay;
    executionOverlay.addAnchor(subnetFilesystemMountAnchor);
  }

  removeSecurityGroupRule(rule: SecurityGroupAnchor['properties']['rules'][0]): void {
    const securityGroupAnchor = this.anchors.find((a) => a instanceof SecurityGroupAnchor) as SecurityGroupAnchor;

    const existingRuleIndex = securityGroupAnchor.properties.rules.findIndex(
      (r) =>
        r.CidrBlock === rule.CidrBlock &&
        r.Egress === rule.Egress &&
        r.FromPort === rule.FromPort &&
        r.IpProtocol === rule.IpProtocol &&
        r.ToPort === rule.ToPort,
    );
    if (existingRuleIndex) {
      securityGroupAnchor.properties.rules.splice(existingRuleIndex, 1);
    }
  }

  async unmountFilesystem(filesystemName: string): Promise<void> {
    const overlayService = await Container.get(OverlayService);
    const parents = this.getParents();

    const subnet = parents['subnet'][0].to as AwsSubnet;

    const filesystemMount = subnet.filesystemMounts.find((f) => f.filesystemName === filesystemName);
    if (!filesystemMount) {
      throw new Error('Filesystem not found in AWS subnet!');
    }
    const subnetFilesystemMountAnchor = subnet.getAnchor(
      filesystemMount.filesystemMountAnchorName,
    ) as SubnetFilesystemMountAnchor;

    const executionOverlayId = `execution-overlay-${this.executionId}`;
    const executionOverlay = overlayService.getOverlayById(executionOverlayId) as ExecutionOverlay;
    executionOverlay.removeAnchor(subnetFilesystemMountAnchor);
  }

  updateDesiredCount(desiredCount: number): void {
    const ecsServiceAnchor = this.getAnchors().find((a) => a instanceof EcsServiceAnchor) as EcsServiceAnchor;
    ecsServiceAnchor.properties.desiredCount = desiredCount;
  }
}
