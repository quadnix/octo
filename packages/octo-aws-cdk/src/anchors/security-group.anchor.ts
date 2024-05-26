import { AAnchor, Anchor } from '@quadnix/octo';
import { AwsExecution } from '../models/execution/aws.execution.model.js';
import { AwsServer } from '../models/server/aws.server.model.js';

interface ISecurityGroupAnchorRule {
  CidrBlock: string;
  Egress: boolean;
  FromPort: number;
  IpProtocol: 'tcp' | 'udp';
  ToPort: number;
}

@Anchor()
export class SecurityGroupAnchor extends AAnchor {
  readonly rules: ISecurityGroupAnchorRule[];

  constructor(anchorId: string, rules: ISecurityGroupAnchorRule[], parent: AwsServer | AwsExecution) {
    super(anchorId, parent);
    this.rules = rules;
  }
}
