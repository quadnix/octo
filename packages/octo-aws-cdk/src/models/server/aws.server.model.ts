import { type IServer, Model, Server } from '@quadnix/octo';
import { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';

@Model()
export class AwsServer extends Server {
  constructor(serverKey: string) {
    super(serverKey);

    this.addAnchor(new IamRoleAnchor('ServerIamRoleAnchor', { iamRoleName: `${serverKey}-ServerRole` }, this));
    this.addAnchor(
      new SecurityGroupAnchor(
        'SecurityGroupAnchor',
        { rules: [], securityGroupName: `${serverKey}-SecurityGroup` },
        this,
      ),
    );
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

  removeSecurityGroupRule(rule: SecurityGroupAnchor['properties']['rules'][0]): void {
    const securityGroupAnchor = this.getAnchor('SecurityGroupAnchor') as SecurityGroupAnchor;

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
