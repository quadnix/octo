import { AModel, type Deployment, type Environment, Execution, Model, ModelError, type Subnet } from '@quadnix/octo';
import { AwsEcsExecutionSchema } from './aws-ecs-execution.schema.js';

/**
 * @internal
 */
@Model<AwsEcsExecution>('@octo', 'execution', AwsEcsExecutionSchema)
export class AwsEcsExecution extends Execution {
  readonly deployments: { main: Deployment; sidecars: Deployment[] };
  readonly customExecutionId: string;

  constructor(
    executionId: string,
    deployments: { main: Deployment; sidecars: Deployment[] },
    environment: Environment,
    subnet: Subnet,
  ) {
    super(deployments.main, environment, subnet);

    // Check total number of deployments.
    if (deployments.sidecars.length > 2) {
      throw new ModelError('No more than 2 sidecar deployments are allowed per aws-ecs-execution!', this);
    }

    // In order for this aws-ecs-execution to properly have defined its parent-child relationship, all parents
    // must claim it as their child. Doing it here, prevents the confusion.
    for (const deployment of deployments.sidecars) {
      deployment.addChild('deploymentTag', this, 'executionId');
    }

    this.deployments = {
      main: deployments.main,
      sidecars: [...deployments.sidecars],
    };
    this.customExecutionId = executionId;
  }

  override get executionId(): string {
    return this.customExecutionId;
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const deployment = parents['deployment']?.find(
      (d) => (d.to as Deployment).deploymentTag === this.deployments.main.deploymentTag,
    )?.to as Deployment;
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

  override synth(): AwsEcsExecutionSchema {
    const parents = this.getParents();
    const deployment = parents['deployment'].find(
      (d) => (d.to as Deployment).deploymentTag === this.deployments.main.deploymentTag,
    )!.to as Deployment;
    const environment = parents['environment'][0]['to'] as Environment;
    const subnet = parents['subnet'][0]['to'] as Subnet;

    return {
      deployment: { context: deployment.getContext() },
      environment: { context: environment.getContext() },
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
      executionId: this.executionId,
      sidecars: this.deployments.sidecars.map((d) => ({ context: d.getContext() })),
      subnet: { context: subnet.getContext() },
    };
  }

  static override async unSynth(
    execution: AwsEcsExecutionSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsEcsExecution> {
    const [deployment, environment, subnet] = (await Promise.all([
      deReferenceContext(execution.deployment.context),
      deReferenceContext(execution.environment.context),
      deReferenceContext(execution.subnet.context),
    ])) as [Deployment, Environment, Subnet];

    const sidecars = (await Promise.all(execution.sidecars.map((d) => deReferenceContext(d.context)))) as Deployment[];

    const newExecution = new AwsEcsExecution(
      execution.executionId,
      { main: deployment, sidecars },
      environment,
      subnet,
    );

    for (const [key, value] of Object.entries(execution.environmentVariables)) {
      newExecution.environmentVariables.set(key, value);
    }

    return newExecution;
  }
}
