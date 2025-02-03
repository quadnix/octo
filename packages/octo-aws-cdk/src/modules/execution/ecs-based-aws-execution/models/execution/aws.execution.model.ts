import { type AModel, type Deployment, type Environment, Execution, Model, type Subnet } from '@quadnix/octo';
import { AwsExecutionSchema } from './aws.execution.schema.js';

@Model<AwsExecution>('@octo', 'execution', AwsExecutionSchema)
export class AwsExecution extends Execution {
  static override async unSynth(
    awsExecution: AwsExecutionSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsExecution> {
    const [deployment, environment, subnet] = (await Promise.all([
      deReferenceContext(awsExecution.deployment.context),
      deReferenceContext(awsExecution.environment.context),
      deReferenceContext(awsExecution.subnet.context),
    ])) as [Deployment, Environment, Subnet];
    const newExecution = new AwsExecution(deployment, environment, subnet);

    for (const [key, value] of Object.entries(awsExecution.environmentVariables)) {
      newExecution.environmentVariables.set(key, value);
    }

    return newExecution;
  }
}
