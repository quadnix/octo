import { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { DiffUtility } from '../../functions/diff/diff.utility.js';
import { Diff } from '../../functions/diff/diff.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { Subnet } from '../subnet/subnet.model.js';
import { IExecution } from './execution.interface.js';

@Model()
export class Execution extends AModel<IExecution, Execution> {
  readonly MODEL_NAME: string = 'execution';

  readonly environmentVariables: Map<string, string> = new Map();

  readonly executionId: string;

  constructor(deployment: Deployment, environment: Environment, subnet: Subnet) {
    super();
    this.executionId = [deployment.deploymentTag, environment.environmentName].join('_');

    // Check if execution can be placed in this subnet. Skip during unSynth().
    if (Object.keys(this.getParents()).length > 0) {
      const environmentRegion = environment.getParents('region')['region'][0].to as Region;
      const subnetRegion = subnet.getParents('region')['region'][0].to as Region;
      if (environmentRegion.regionId !== subnetRegion.regionId) {
        throw new Error('Environment and Subnet must be in the same region!');
      }
    }

    // Check for duplicates. Skip during unSynth().
    if (Object.keys(this.getParents()).length > 0) {
      if (
        deployment.getChild('execution', [{ key: 'executionId', value: this.executionId }]) ||
        environment.getChild('execution', [{ key: 'executionId', value: this.executionId }]) ||
        subnet.getChild('execution', [{ key: 'executionId', value: this.executionId }])
      ) {
        throw new Error('Execution already exists!');
      }
    }

    // In order for this execution to properly have defined its parent-child relationship, all parents
    // must claim it as their child. Doing it here, prevents the confusion.
    deployment.addChild('deploymentTag', this, 'executionId');
    environment.addChild('environmentName', this, 'executionId');
    subnet.addChild('subnetId', this, 'executionId');
  }

  override async diff(previous?: Execution): Promise<Diff[]> {
    // deployment, environment, and executionId intentionally not included in diff,
    // since they all contribute to executionId (primary key) which can never change.

    // Generate diff of environmentVariables.
    return DiffUtility.diffMap(
      previous || ({ environmentVariables: new Map() } as Execution),
      this,
      'environmentVariables',
    );
  }

  getContext(): string {
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

  synth(): IExecution {
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
    const newExecution = new Execution(deployment, environment, subnet);

    for (const key in execution.environmentVariables) {
      newExecution.environmentVariables.set(key, execution.environmentVariables[key]);
    }

    return newExecution;
  }
}
