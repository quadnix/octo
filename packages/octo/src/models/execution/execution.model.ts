import { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { DiffUtility } from '../../functions/diff/diff.utility.js';
import { Diff } from '../../functions/diff/diff.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { Image } from '../image/image.model.js';
import { AModel } from '../model.abstract.js';
import { IExecution } from './execution.interface.js';

@Model()
export class Execution extends AModel<IExecution, Execution> {
  readonly MODEL_NAME: string = 'execution';

  readonly environmentVariables: Map<string, string> = new Map();

  readonly executionId: string;

  readonly image: Image;

  constructor(deployment: Deployment, environment: Environment, image: Image) {
    super();
    this.executionId = [deployment.deploymentTag, environment.environmentName].join('_');

    // Check for duplicates.
    if (
      deployment.getChild('execution', [{ key: 'executionId', value: this.executionId }]) ||
      environment.getChild('execution', [{ key: 'executionId', value: this.executionId }])
    ) {
      throw new Error('Execution already exists!');
    }

    // In order for this execution to properly have defined its parent-child relationship, both execution and deployment
    // must claim it as their child. Doing it here, prevents the confusion.
    deployment.addChild('deploymentTag', this, 'executionId');
    environment.addChild('environmentName', this, 'executionId');

    this.image = image;
    this.addRelationship('executionId', image, 'imageId');
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
    const deployment: Deployment = parents['deployment'][0]['to'] as Deployment;
    const environment: Environment = parents['environment'][0]['to'] as Environment;
    return [`${this.MODEL_NAME}=${this.executionId}`, deployment.getContext(), environment.getContext()].join(',');
  }

  synth(): IExecution {
    const parents = this.getParents();
    const deployment: Deployment = parents['deployment'][0]['to'] as Deployment;
    const environment: Environment = parents['environment'][0]['to'] as Environment;

    return {
      deployment: { context: deployment.getContext() },
      environment: { context: environment.getContext() },
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
      image: { context: this.image.getContext() },
    };
  }

  static override async unSynth(
    execution: IExecution,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Execution> {
    const deployment = (await deReferenceContext(execution.deployment.context)) as Deployment;
    const environment = (await deReferenceContext(execution.environment.context)) as Environment;
    const image = (await deReferenceContext(execution.image.context)) as Image;
    const newExecution = new Execution(deployment, environment, image);

    for (const key in execution.environmentVariables) {
      newExecution.environmentVariables.set(key, execution.environmentVariables[key]);
    }

    return newExecution;
  }
}
