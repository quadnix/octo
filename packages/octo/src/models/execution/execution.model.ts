import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { ArrayUtility } from '../../utilities/array/array.utility.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { Server } from '../server/server.model.js';
import { Subnet } from '../subnet/subnet.model.js';
import { ExecutionSchema } from './execution.schema.js';

/**
 * An Execution model is the combination of a {@link Deployment}, an {@link Environment}, and a {@link Subnet}.
 * It represents a physical server, running the deployment code, in the given environment, placed in the given subnet.
 *
 * @example
 * ```ts
 * const deployment = new Deployment('v1');
 * const environment = new Environment('qa');
 * const subnet = new Subnet(region, 'private');
 * const execution = new Execution(deployment, environment, subnet);
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Execution>('@octo', 'execution', ExecutionSchema)
export class Execution extends AModel<ExecutionSchema, Execution> {
  readonly environmentVariables: Map<string, string> = new Map();

  constructor(deployment: Deployment, environment: Environment, subnet: Subnet) {
    super();

    // Check if execution can be placed in this subnet.
    const environmentRegions = environment.getParents('region')['region'] || [];
    const subnetRegions = subnet.getParents('region')['region'] || [];
    if (
      environmentRegions.length > 0 &&
      subnetRegions.length > 0 &&
      (environmentRegions[0].to as Region).regionId !== (subnetRegions[0].to as Region).regionId
    ) {
      throw new ModelError('Environment and Subnet must be in the same region!', this);
    }

    // Check for duplicates.
    const deploymentExecutions = (deployment.getChildren('execution')['execution'] || []).map(
      (d): Execution => d.to as Execution,
    );
    const environmentExecutions = (environment.getChildren('execution')['execution'] || []).map(
      (d): Execution => d.to as Execution,
    );
    const subnetExecutions = (subnet.getChildren('execution')['execution'] || []).map(
      (d): Execution => d.to as Execution,
    );

    if (
      ArrayUtility.intersect(
        (a: Execution, b: Execution): boolean => {
          return a.executionId === b.executionId;
        },
        deploymentExecutions,
        environmentExecutions,
        subnetExecutions,
      ).length > 0
    ) {
      throw new ModelError('Execution already exists!', this);
    }

    // In order for this execution to properly have defined its parent-child relationship, all parents
    // must claim it as their child. Doing it here, prevents the confusion.
    deployment.addChild('deploymentTag', this, 'executionId');
    environment.addChild('environmentName', this, 'executionId');
    subnet.addChild('subnetId', this, 'executionId');
  }

  /**
   * An `executionId` is a unique identifier for this execution.
   * - Format of executionId is `{serverKey}-{deploymentTag}-{regionId}-{environmentName}-{subnetName}`
   */
  get executionId(): string {
    const parents = this.getParents();
    const deployment = parents['deployment'][0].to as Deployment;
    const server = deployment.getParents()['server'][0].to as Server;
    const environment = parents['environment'][0].to as Environment;
    const region = environment.getParents()['region'][0].to as Region;
    const subnet = parents['subnet'][0].to as Subnet;
    return [
      server.serverKey,
      deployment.deploymentTag,
      region.regionId,
      environment.environmentName,
      subnet.subnetName,
    ].join('-');
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const deployment = parents['deployment']?.[0]?.to as Deployment;
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

  override synth(): ExecutionSchema {
    const parents = this.getParents();
    const deployment = parents['deployment'][0]['to'] as Deployment;
    const environment = parents['environment'][0]['to'] as Environment;
    const subnet = parents['subnet'][0]['to'] as Subnet;

    return {
      deployment: { context: deployment.getContext() },
      environment: { context: environment.getContext() },
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
      subnet: { context: subnet.getContext() },
    };
  }

  static override async unSynth(
    execution: ExecutionSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Execution> {
    const [deployment, environment, subnet] = (await Promise.all([
      deReferenceContext(execution.deployment.context),
      deReferenceContext(execution.environment.context),
      deReferenceContext(execution.subnet.context),
    ])) as [Deployment, Environment, Subnet];
    const newExecution = new Execution(deployment, environment, subnet);

    for (const [key, value] of Object.entries(execution.environmentVariables)) {
      newExecution.environmentVariables.set(key, value);
    }

    return newExecution;
  }
}
