import { AModel, type Deployment, type Environment, Execution, Model, ModelError, type Subnet } from '@quadnix/octo';
import { AwsExecutionSchema } from './aws.execution.schema.js';

/**
 * @internal
 */
@Model<AwsExecution>('@octo', 'execution', AwsExecutionSchema)
export class AwsExecution extends Execution {
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
      throw new ModelError('No more than 2 sidecar deployments are allowed per execution!', this);
    }

    // In order for this execution to properly have defined its parent-child relationship, all parents
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
      `${(this.constructor as typeof Execution).NODE_NAME}=${this.executionId}`,
      deployment.getContext(),
      environment.getContext(),
      subnet.getContext(),
    ].join(',');
  }

  override synth(): AwsExecutionSchema {
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
    awsExecution: AwsExecutionSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsExecution> {
    const [deployment, environment, subnet] = (await Promise.all([
      deReferenceContext(awsExecution.deployment.context),
      deReferenceContext(awsExecution.environment.context),
      deReferenceContext(awsExecution.subnet.context),
    ])) as [Deployment, Environment, Subnet];

    const sidecars = (await Promise.all(
      awsExecution.sidecars.map((d) => deReferenceContext(d.context)),
    )) as Deployment[];

    const newExecution = new AwsExecution(
      awsExecution.executionId,
      { main: deployment, sidecars },
      environment,
      subnet,
    );

    for (const [key, value] of Object.entries(awsExecution.environmentVariables)) {
      newExecution.environmentVariables.set(key, value);
    }

    return newExecution;
  }
}
