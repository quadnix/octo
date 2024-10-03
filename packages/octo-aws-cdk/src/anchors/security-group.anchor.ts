import { AAnchor, Anchor, type IAnchor, type ModifyInterface } from '@quadnix/octo';
import type { AwsExecution } from '../models/execution/aws.execution.model.js';
import type { AwsServer } from '../models/server/aws.server.model.js';

interface ISecurityGroupAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      rules: ISecurityGroupAnchorRule[];
      securityGroupName: string;
    }
  > {}

interface ISecurityGroupAnchorRule {
  CidrBlock: string;
  Egress: boolean;
  FromPort: number;
  IpProtocol: 'tcp' | 'udp';
  ToPort: number;
}

@Anchor('@octo')
export class SecurityGroupAnchor extends AAnchor {
  declare properties: ISecurityGroupAnchorProperties;

  constructor(anchorId: string, properties: ISecurityGroupAnchorProperties, parent: AwsServer | AwsExecution) {
    super(anchorId, properties, parent);
  }
}
