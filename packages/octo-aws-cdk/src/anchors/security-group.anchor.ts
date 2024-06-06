import { AAnchor, Anchor, type IAnchor, type UnknownModel } from '@quadnix/octo';
import type { AwsExecution } from '../models/execution/aws.execution.model.js';
import type { AwsServer } from '../models/server/aws.server.model.js';

interface ISecurityGroupAnchor extends IAnchor {
  rules: ISecurityGroupAnchorRule[];
}

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

  override synth(): ISecurityGroupAnchor {
    return {
      anchorId: this.anchorId,
      parent: { context: this.getParent().getContext() },
      rules: [...this.rules],
    };
  }

  override toJSON(): object {
    return {
      anchorId: this.anchorId,
      parent: this.getParent().getContext(),
      rules: [...this.rules],
    };
  }

  static override async unSynth(
    deserializationClass: typeof SecurityGroupAnchor,
    anchor: ISecurityGroupAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<SecurityGroupAnchor> {
    const parent = (await deReferenceContext(anchor.parent.context)) as AwsServer | AwsExecution;
    const newAnchor = parent.getAnchor(anchor.anchorId) as SecurityGroupAnchor;
    if (!newAnchor) {
      return new deserializationClass(anchor.anchorId, anchor.rules, parent);
    }
    return newAnchor;
  }
}
