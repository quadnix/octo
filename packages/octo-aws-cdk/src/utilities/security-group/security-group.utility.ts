import type { SecurityGroupSchema } from '../../resources/security-group/index.schema.js';

export class SecurityGroupUtility {
  static isSecurityGroupRuleEqual(
    cr: SecurityGroupSchema['properties']['rules'][0],
    pr: SecurityGroupSchema['properties']['rules'][0],
  ): boolean {
    return (
      cr.CidrBlock === pr.CidrBlock &&
      cr.Egress === pr.Egress &&
      cr.FromPort === pr.FromPort &&
      cr.IpProtocol === pr.IpProtocol &&
      cr.ToPort === pr.ToPort
    );
  }
}
