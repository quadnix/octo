import { AAnchor, Anchor, IAnchor } from '@quadnix/octo';
import type { UnknownModel } from '@quadnix/octo';
import type { AwsExecution } from '../models/execution/aws.execution.model.js';

interface IEcsServiceAnchor extends IAnchor {
  properties: IEcsServiceAnchorProperties;
}

interface IEcsServiceAnchorProperties {
  desiredCount: number;
}

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
      properties: JSON.parse(JSON.stringify(this.properties)),
    };
  }

  override toJSON(): object {
    return {
      anchorId: this.anchorId,
      parent: this.getParent().getContext(),
      properties: this.properties,
    };
  }

  static override async unSynth(
    deserializationClass: typeof EcsServiceAnchor,
    anchor: IEcsServiceAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<EcsServiceAnchor> {
    const parent = (await deReferenceContext(anchor.parent.context)) as AwsExecution;
    const newAnchor = parent.getAnchor(anchor.anchorId) as EcsServiceAnchor;
    if (!newAnchor) {
      return new deserializationClass(anchor.anchorId, anchor.properties, parent);
    }
    return newAnchor;
  }
}
