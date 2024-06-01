import { AAnchor, Anchor, IAnchor, UnknownModel } from '@quadnix/octo';
import { AwsExecution } from '../models/execution/aws.execution.model.js';

interface IEcsServiceAnchor extends IAnchor {
  properties: IEcsServiceAnchorProperties;
}

interface IEcsServiceAnchorProperties {}

@Anchor()
export class EcsServiceAnchor extends AAnchor {
  readonly properties: IEcsServiceAnchorProperties;

  constructor(anchorId: string, properties: IEcsServiceAnchorProperties, parent: AwsExecution) {
    super(anchorId, parent);
    this.properties = properties;
  }

  override synth(): IEcsServiceAnchor {
    return {
      anchorId: this.anchorId,
      parent: { context: this.getParent().getContext() },
      properties: {},
    };
  }

  override toJSON(): object {
    return {
      anchorId: this.anchorId,
      parent: this.getParent().getContext(),
      properties: {},
    };
  }

  static override async unSynth(
    deserializationClass: typeof EcsServiceAnchor,
    anchor: IEcsServiceAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<EcsServiceAnchor> {
    const parent = (await deReferenceContext(anchor.parent.context)) as AwsExecution;
    const newAnchor = parent.getAnchor(anchor.anchorId) as EcsServiceAnchor;
    return newAnchor ?? new deserializationClass(anchor.anchorId, anchor.properties, parent);
  }
}
