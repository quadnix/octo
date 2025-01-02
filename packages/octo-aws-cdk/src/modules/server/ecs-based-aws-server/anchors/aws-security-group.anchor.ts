import { AAnchor, Anchor, BaseAnchorSchema, Schema, type Server } from '@quadnix/octo';

export interface ISecurityGroupAnchorRule {
  CidrBlock: string;
  Egress: boolean;
  FromPort: number;
  IpProtocol: 'tcp' | 'udp';
  ToPort: number;
}

class AwsSecurityGroupAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<{
    rules: ISecurityGroupAnchorRule[];
    securityGroupName: string;
  }>();
}

@Anchor('@octo')
export class AwsSecurityGroupAnchor extends AAnchor<AwsSecurityGroupAnchorSchema, Server> {
  declare properties: AwsSecurityGroupAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsSecurityGroupAnchorSchema['properties'], parent: Server) {
    super(anchorId, properties, parent);
  }
}
