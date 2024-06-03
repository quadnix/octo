import { AAnchor, Anchor, IAnchor } from '@quadnix/octo';
import type { UnknownModel } from '@quadnix/octo';
import type { AwsDeployment } from '../models/deployment/aws.deployment.model.js';

interface ITaskDefinitionAnchor extends IAnchor {
  properties: ITaskDefinitionAnchorProperties;
}

interface ITaskDefinitionAnchorProperties {
  image: {
    command: string;
    ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
    uri: string;
  };
}

@Anchor()
export class TaskDefinitionAnchor extends AAnchor {
  readonly properties: ITaskDefinitionAnchorProperties;

  constructor(anchorId: string, properties: ITaskDefinitionAnchorProperties, parent: AwsDeployment) {
    super(anchorId, parent);
    this.properties = properties;
  }

  override synth(): ITaskDefinitionAnchor {
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
    deserializationClass: typeof TaskDefinitionAnchor,
    anchor: ITaskDefinitionAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<TaskDefinitionAnchor> {
    const parent = (await deReferenceContext(anchor.parent.context)) as AwsDeployment;
    const newAnchor = parent.getAnchor(anchor.anchorId) as TaskDefinitionAnchor;
    if (!newAnchor) {
      return new deserializationClass(anchor.anchorId, anchor.properties, parent);
    }
    return newAnchor;
  }
}
