import { AAnchor, Anchor, type IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsDeployment } from '../models/deployment/aws.deployment.model.js';

interface ITaskDefinitionAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      image: {
        command: string;
        ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
        uri: string;
      };
    }
  > {}

@Anchor()
export class TaskDefinitionAnchor extends AAnchor {
  declare properties: ITaskDefinitionAnchorProperties;

  constructor(anchorId: string, properties: ITaskDefinitionAnchorProperties, parent: AwsDeployment) {
    super(anchorId, properties, parent);
  }
}
