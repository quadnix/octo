import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEnvironment } from '../models/environment/aws.environment.model.js';
import type { AwsExecution } from '../models/execution/aws.execution.model.js';

@Anchor()
export class EnvironmentVariablesAnchor extends AAnchor {
  constructor(anchorId: string, parent: AwsEnvironment | AwsExecution) {
    super(anchorId, parent);
  }
}
