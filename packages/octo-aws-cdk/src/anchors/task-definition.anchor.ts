import { AAnchor, Anchor, type IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsDeployment } from '../models/deployment/aws.deployment.model.js';

interface ITaskDefinitionAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      cpu: 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;
      image: {
        command: string;
        ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
        uri: string;
      };
      memory: number;
    }
  > {}

@Anchor('@octo')
export class TaskDefinitionAnchor extends AAnchor {
  declare properties: ITaskDefinitionAnchorProperties;

  constructor(anchorId: string, properties: ITaskDefinitionAnchorProperties, parent: AwsDeployment) {
    super(anchorId, properties, parent);
  }
}
