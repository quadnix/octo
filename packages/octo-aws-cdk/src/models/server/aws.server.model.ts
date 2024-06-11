import { type IServer, Model, Server } from '@quadnix/octo';
import { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import type { AwsDeployment } from '../deployment/aws.deployment.model.js';

@Model()
export class AwsServer extends Server {
  constructor(serverKey: string) {
    super(serverKey);

    this.anchors.push(new IamRoleAnchor('ServerIamRoleAnchor', { iamRoleName: `${serverKey}-ServerRole` }, this));
    this.anchors.push(
      new SecurityGroupAnchor(
        'SecurityGroupAnchor',
        { rules: [], securityGroupName: `${serverKey}-SecurityGroup` },
        this,
      ),
    );
  }

  override addDeployment(deployment: AwsDeployment): void {
    super.addDeployment(deployment);
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

  getSecurityGroupRules(): SecurityGroupAnchor['properties']['rules'] {
    const securityGroupAnchor = this.anchors.find((a) => a instanceof SecurityGroupAnchor) as SecurityGroupAnchor;

    return securityGroupAnchor.properties.rules;
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
    if (existingRuleIndex > -1) {
      securityGroupAnchor.properties.rules.splice(existingRuleIndex, 1);
    }
  }

  static override async unSynth(server: IServer): Promise<AwsServer> {
    return new AwsServer(server.serverKey);
  }
}
