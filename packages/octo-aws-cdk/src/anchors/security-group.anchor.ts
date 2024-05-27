import { AAnchor, Anchor, IAnchor, UnknownModel } from '@quadnix/octo';
import { AwsExecution } from '../models/execution/aws.execution.model.js';
import { AwsServer } from '../models/server/aws.server.model.js';

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
    deserializationClass: any,
    anchor: ISecurityGroupAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<SecurityGroupAnchor> {
    const parent = await deReferenceContext(anchor.parent.context);
    const newAnchor = parent.getAnchor(anchor.anchorId) as SecurityGroupAnchor;
    if (!newAnchor) {
      const deserializedAnchor = new deserializationClass(anchor.anchorId, parent);
      deserializedAnchor.rules = anchor.rules;
      return deserializedAnchor;
    }
    return newAnchor;
  }
}
