import { AAnchor, Anchor, IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsEnvironment } from '../models/environment/aws.environment.model.js';
import type { AwsExecution } from '../models/execution/aws.execution.model.js';

interface IEnvironmentVariablesAnchorProperties extends ModifyInterface<IAnchor['properties'], Record<string, never>> {}

@Anchor()
export class EnvironmentVariablesAnchor extends AAnchor {
  declare properties: IEnvironmentVariablesAnchorProperties;

  constructor(
    anchorId: string,
    properties: IEnvironmentVariablesAnchorProperties,
    parent: AwsEnvironment | AwsExecution,
  ) {
    super(anchorId, properties, parent);
  }
}
