import { DiffUtility } from '../../functions/diff/diff.utility';
import { Diff } from '../../functions/diff/diff.model';
import { HookService } from '../../functions/hook/hook.service';
import { Deployment } from '../deployment/deployment.model';
import { Environment } from '../environment/environment.model';
import { HOOK_NAMES } from '../hook.interface';
import { Model } from '../model.abstract';
import { IExecution } from './execution.interface';

export class Execution extends Model<IExecution, Execution> {
  readonly MODEL_NAME: string = 'execution';

  readonly environmentVariables: Map<string, string> = new Map();

  readonly executionId: string;

  private readonly hookService: HookService;

  constructor(deployment: Deployment, environment: Environment) {
    super();
    this.executionId = [deployment.deploymentTag, environment.environmentName].join('_');
    this.hookService = HookService.getInstance();

    // In order for this execution to properly have defined its parent-child relationship, both execution and deployment
    // must claim it as their child. Doing it here, prevents the confusion.
    deployment.addChild('deploymentTag', this, 'executionId');
    environment.addChild('environmentName', this, 'executionId');
    this.hookService.applyHooks(HOOK_NAMES.ADD_EXECUTION);
  }

  clone(): Execution {
    const parents = this.getParents();
    const deployment: Deployment = parents['deployment'][0]['to'] as Deployment;
    const environment: Environment = parents['environment'][0]['to'] as Environment;
    const execution = new Execution(deployment, environment);

    for (const [key, value] of this.environmentVariables) {
      execution.environmentVariables.set(key, value);
    }

    return execution;
  }

  override diff(previous?: Execution): Diff[] {
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
    };
  }

  static async unSynth(
    execution: IExecution,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<Execution> {
    const deployment = (await deReferenceContext(execution.deployment.context)) as Deployment;
    const environment = (await deReferenceContext(execution.environment.context)) as Environment;
    const newExecution = new Execution(deployment, environment);

    for (const key of Object.keys(execution.environmentVariables)) {
      newExecution.environmentVariables.set(key, execution.environmentVariables[key]);
    }

    return newExecution;
  }
}
