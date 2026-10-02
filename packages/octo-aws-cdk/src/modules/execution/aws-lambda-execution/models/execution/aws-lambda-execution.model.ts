import { AModel, type Deployment, type Environment, Execution, Model, type Subnet } from '@quadnix/octo';
import { AwsLambdaExecutionSchema } from './aws-lambda-execution.schema.js';

/**
 * @internal
 */
@Model<AwsLambdaExecution>('@octo', 'execution', AwsLambdaExecutionSchema)
export class AwsLambdaExecution extends Execution {
  readonly customExecutionId: string;

  /**
   * @internal
   */
  override get executionId(): string {
    return this.customExecutionId;
  }

  /**
   * @internal
   */
  constructor(executionId: string, deployment: Deployment, environment: Environment, subnet: Subnet) {
    super(deployment, environment, subnet);

    this.customExecutionId = executionId;
  }

  /**
   * @internal
   */
  static override async unSynth(
    execution: AwsLambdaExecutionSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsLambdaExecution> {
    const [deployment, environment, subnet] = (await Promise.all([
      deReferenceContext(execution.deployment.context),
      deReferenceContext(execution.environment.context),
      deReferenceContext(execution.subnet.context),
    ])) as [Deployment, Environment, Subnet];

    const newExecution = new AwsLambdaExecution(execution.executionId, deployment, environment, subnet);
    for (const [key, value] of Object.entries(execution.environmentVariables)) {
      newExecution.environmentVariables.set(key, value);
    }

    return newExecution;
  }

  /**
   * @internal
   */
  override setContext(): string | undefined {
    const parents = this.getParents();
    const deployment = parents['deployment']?.[0]?.to as Deployment;
    const environment = parents['environment']?.[0]?.to as Environment;
    const subnet = parents['subnet']?.[0]?.to as Subnet;
    if (!deployment || !environment || !subnet) {
      return undefined;
    }
    return [
      `${Execution.NODE_NAME}=${this.executionId}`,
      deployment.getContext(),
      environment.getContext(),
      subnet.getContext(),
    ].join(',');
  }

  /**
   * @internal
   */
  override synth(): AwsLambdaExecutionSchema {
    const parents = this.getParents();
    const deployment = parents['deployment'][0].to as Deployment;
    const environment = parents['environment'][0].to as Environment;
    const subnet = parents['subnet'][0].to as Subnet;

    return {
      deployment: { context: deployment.getContext() },
      environment: { context: environment.getContext() },
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
      executionId: this.executionId,
      subnet: { context: subnet.getContext() },
    };
  }
}
