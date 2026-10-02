import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsLambdaExecutionAnchorSchema } from './aws-lambda-execution.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsLambdaExecutionAnchor extends AAnchor<
  AwsLambdaExecutionAnchorSchema,
  AwsLambdaExecutionAnchorSchema['parentInstance']
> {
  declare properties: AwsLambdaExecutionAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsLambdaExecutionAnchorSchema['properties'],
    parent: AwsLambdaExecutionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
