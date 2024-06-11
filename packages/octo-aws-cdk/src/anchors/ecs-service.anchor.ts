import { AAnchor, Anchor, type IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsExecution } from '../models/execution/aws.execution.model.js';

interface IEcsServiceAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      desiredCount: number;
    }
  > {}

@Anchor()
export class EcsServiceAnchor extends AAnchor {
  declare properties: IEcsServiceAnchorProperties;

  constructor(anchorId: string, properties: IEcsServiceAnchorProperties, parent: AwsExecution) {
    super(anchorId, properties, parent);
  }
}
