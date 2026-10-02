import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsLambdaFunctionAnchorSchema } from './aws-lambda-function.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsLambdaFunctionAnchor extends AAnchor<
  AwsLambdaFunctionAnchorSchema,
  AwsLambdaFunctionAnchorSchema['parentInstance']
> {
  declare properties: AwsLambdaFunctionAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsLambdaFunctionAnchorSchema['properties'],
    parent: AwsLambdaFunctionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
