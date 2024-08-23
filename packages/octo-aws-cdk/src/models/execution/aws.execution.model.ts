import { Container, Execution, IExecution, Model, OverlayService, type UnknownModel } from '@quadnix/octo';
import { EcsServiceAnchor } from '../../anchors/ecs-service.anchor.js';
import { EnvironmentVariablesAnchor } from '../../anchors/environment-variables.anchor.js';
import { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
import { ExecutionOverlay } from '../../overlays/execution/execution.overlay.js';
import { SecurityGroupOverlay } from '../../overlays/security-group/security-group.overlay.js';
import { SubnetFilesystemMountOverlay } from '../../overlays/subnet-filesystem-mount/subnet-filesystem-mount.overlay.js';
import type { AwsDeployment } from '../deployment/aws.deployment.model.js';
import type { AwsEnvironment } from '../environment/aws.environment.model.js';
import type { AwsRegion } from '../region/aws.region.model.js';
import type { AwsServer } from '../server/aws.server.model.js';
import type { AwsSubnet } from '../subnet/aws.subnet.model.js';

@Model()
export class AwsExecution extends Execution {
  constructor(deployment: AwsDeployment, environment: AwsEnvironment, subnet: AwsSubnet, _calledFromUnSynth = false) {
    super(deployment, environment, subnet);

    // Skip creation of these anchors during unSynth() since dependencies are not available at this time.
    if (!_calledFromUnSynth) {
      this.addAnchor(new EcsServiceAnchor('EcsServiceAnchor', { desiredCount: 1 }, this));
      this.addAnchor(new EnvironmentVariablesAnchor('EnvironmentVariablesAnchor', {}, this));
      this.addAnchor(
        new SecurityGroupAnchor(
          'SecurityGroupAnchor',
          { rules: [], securityGroupName: `${this.executionId}-SecurityGroup` },
          this,
        ),
      );
    }
  }

  addSecurityGroupRule(rule: SecurityGroupAnchor['properties']['rules'][0]): void {
    const securityGroupAnchor = this.getAnchor('SecurityGroupAnchor') as SecurityGroupAnchor;

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

  getSecurityGroupRules(): SecurityGroupAnchor['properties']['rules'] {
    const securityGroupAnchor = this.getAnchor('SecurityGroupAnchor') as SecurityGroupAnchor;

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

    // Deployment Anchor - TaskDefinitionAnchor.
    const taskDefinitionAnchor = deployment.getAnchor('TaskDefinitionAnchor') as TaskDefinitionAnchor;
    // Environment Anchor - EnvironmentVariablesAnchor.
    const environmentEVAnchor = environment.getAnchor('EnvironmentVariablesAnchor') as EnvironmentVariablesAnchor;
    // Execution Anchor - EcsServiceAnchor.
    const ecsServiceAnchor = this.getAnchor('EcsServiceAnchor') as EcsServiceAnchor;
    // Execution Anchor - EnvironmentVariablesAnchor.
    const executionEVAnchor = this.getAnchor('EnvironmentVariablesAnchor') as EnvironmentVariablesAnchor;
    // Execution Anchor - SecurityGroupAnchor.
    const executionSecurityGroupAnchor = this.getAnchor('SecurityGroupAnchor') as SecurityGroupAnchor;
    // Server Anchor - ServerIamRoleAnchor.
    const serverIamRoleAnchor = server.getAnchor('ServerIamRoleAnchor') as IamRoleAnchor;
    // Server Anchor - SecurityGroupAnchor.
    const serverSecurityGroupAnchor = server.getAnchor('SecurityGroupAnchor') as SecurityGroupAnchor;

    // Add SecurityGroupOverlay for security group lifecycle.
    const securityGroupOverlayId = `security-group-overlay-${this.executionId}`;
    const securityGroupOverlay = new SecurityGroupOverlay(
      securityGroupOverlayId,
      {
        awsRegionId: region.awsRegionId,
        regionId: region.regionId,
      },
      [serverSecurityGroupAnchor, executionSecurityGroupAnchor],
    );
    overlayService.addOverlay(securityGroupOverlay);

    // Add ExecutionOverlay for container lifecycle.
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

    // ExecutionOverlay vs SecurityGroupOverlay relationship.
    securityGroupOverlay.addChild('overlayId', executionOverlay, 'overlayId');
  }

  async mountFilesystem(filesystemName: string): Promise<void> {
    const subnet = this.getParents()['subnet'][0].to as AwsSubnet;
    const filesystemMount = subnet.filesystemMounts.find((f) => f.filesystemName === filesystemName);
    if (!filesystemMount) {
      throw new Error('Filesystem not found in AWS subnet!');
    }

    const overlayService = await Container.get(OverlayService);

    const subnetFilesystemMountAnchor = subnet.getAnchor(
      filesystemMount.filesystemMountAnchorName,
    ) as SubnetFilesystemMountAnchor;

    // eslint-disable-next-line max-len
    const subnetFilesystemMountOverlayId = `subnet-filesystem-mount-overlay-${filesystemMount.filesystemMountAnchorName}`;
    const subnetFilesystemMountOverlay = overlayService.getOverlayById(
      subnetFilesystemMountOverlayId,
    ) as SubnetFilesystemMountOverlay;

    // Update ExecutionOverlay with SubnetFilesystemMountAnchor anchor.
    const executionOverlayId = `execution-overlay-${this.executionId}`;
    const executionOverlay = overlayService.getOverlayById(executionOverlayId) as ExecutionOverlay;
    executionOverlay.addAnchor(subnetFilesystemMountAnchor);

    // ExecutionOverlay vs SubnetFilesystemMountOverlay relationship.
    subnetFilesystemMountOverlay.addChild('overlayId', executionOverlay, 'overlayId');
  }

  updateDesiredCount(desiredCount: number): void {
    const ecsServiceAnchor = this.getAnchor('EcsServiceAnchor') as EcsServiceAnchor;
    ecsServiceAnchor.properties.desiredCount = desiredCount;
  }

  static override async unSynth(
    execution: IExecution,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<AwsExecution> {
    const [deployment, environment, subnet] = (await Promise.all([
      deReferenceContext(execution.deployment.context),
      deReferenceContext(execution.environment.context),
      deReferenceContext(execution.subnet.context),
    ])) as [AwsDeployment, AwsEnvironment, AwsSubnet];
    const newExecution = new AwsExecution(deployment, environment, subnet, true);

    for (const [key, value] of Object.entries(execution.environmentVariables)) {
      newExecution.environmentVariables.set(key, value);
    }

    return newExecution;
  }
}
