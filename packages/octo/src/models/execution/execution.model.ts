import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { DiffUtility } from '../../functions/diff/diff.utility.js';
import type { Diff } from '../../functions/diff/diff.js';
import { ArrayUtility } from '../../utilities/array/array.utility.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { Server } from '../server/server.model.js';
import { Subnet } from '../subnet/subnet.model.js';
import type { IExecution } from './execution.interface.js';

@Model()
export class Execution extends AModel<IExecution, Execution> {
  readonly MODEL_NAME: string = 'execution';

  readonly environmentVariables: Map<string, string> = new Map();

  constructor(deployment: Deployment, environment: Environment, subnet: Subnet, _calledFromUnSynth = false) {
    super();

    // Check if execution can be placed in this subnet.
    if (!_calledFromUnSynth) {
      const environmentRegion = environment.getParents('region')['region'][0].to as Region;
      const subnetRegion = subnet.getParents('region')['region'][0].to as Region;
      if (environmentRegion.regionId !== subnetRegion.regionId) {
        throw new Error('Environment and Subnet must be in the same region!');
      }
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
      throw new Error('Execution already exists!');
    }

    // In order for this execution to properly have defined its parent-child relationship, all parents
    // must claim it as their child. Doing it here, prevents the confusion.
    deployment.addChild('deploymentTag', this, 'executionId');
    environment.addChild('environmentName', this, 'executionId');
    subnet.addChild('subnetId', this, 'executionId');
  }

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

  override async diffProperties(previous: Execution): Promise<Diff[]> {
    return DiffUtility.diffMap(previous, this, 'environmentVariables');
  }

  override getContext(): string {
    const parents = this.getParents();
    const deployment = parents['deployment'][0]['to'] as Deployment;
    const environment = parents['environment'][0]['to'] as Environment;
    const subnet = parents['subnet'][0]['to'] as Subnet;
    return [
      `${this.MODEL_NAME}=${this.executionId}`,
      deployment.getContext(),
      environment.getContext(),
      subnet.getContext(),
    ].join(',');
  }

  override synth(): IExecution {
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
    execution: IExecution,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Execution> {
    const deployment = (await deReferenceContext(execution.deployment.context)) as Deployment;
    const environment = (await deReferenceContext(execution.environment.context)) as Environment;
    const subnet = (await deReferenceContext(execution.subnet.context)) as Subnet;
    const newExecution = new Execution(deployment, environment, subnet, true);

    for (const key in execution.environmentVariables) {
      newExecution.environmentVariables.set(key, execution.environmentVariables[key]);
    }

    return newExecution;
  }
}
