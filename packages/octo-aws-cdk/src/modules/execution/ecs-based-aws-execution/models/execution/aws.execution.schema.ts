import { ExecutionSchema, type IModelReference, Schema, Validate } from '@quadnix/octo';

export class AwsExecutionSchema extends ExecutionSchema {
  @Validate({ options: { minLength: 1 } })
  executionId: string;

  sidecars = Schema<IModelReference[]>();
}
