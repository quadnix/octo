import { DiffUtility } from '../../functions/diff/diff.utility';
import { Diff } from '../../functions/diff/diff.model';
import { Deployment } from '../deployment/deployment.model';
import { Environment } from '../environment/environment.model';
import { Instance } from '../instance/instance.model';
import { Model } from '../model.abstract';
import { IExecution } from './execution.interface';

export class Execution extends Model<IExecution, Execution> {
  readonly MODEL_NAME: string = 'execution';

  readonly deployment: Deployment;

  readonly environment: Environment;

  readonly environmentVariables: Map<string, string> = new Map();

  readonly executionId: string;

  // There are intentionally no methods to add an instance,
  // since that can only be done by the Engine at runtime.
  // Trying to create an instance object locally would not accomplish anything,
  // since an instance can only be constructed, never diff-ed.
  readonly instances: Instance[] = [];

  constructor(deployment: Deployment, environment: Environment) {
    super();

    this.deployment = deployment;
    this.environment = environment;
    this.executionId = [deployment.deploymentTag, environment.environmentName].join('_');
  }

  clone(): Execution {
    const execution = new Execution(this.deployment, this.environment);

    for (const [key, value] of this.environmentVariables) {
      execution.environmentVariables.set(key, value);
    }

    this.instances.forEach((instance) => {
      execution.instances.push(new Instance(instance.taskId));
    });

    return execution;
  }

  diff(previous?: Execution): Diff[] {
    // Generate diff of environmentVariables.
    return DiffUtility.diffMap(
      previous || ({ environmentVariables: new Map() } as Execution),
      this,
      'environmentVariables',
    );
  }

  isEqual(instance: Execution): boolean {
    return this.executionId === instance.executionId;
  }

  synth(): IExecution {
    return {
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
      executionId: this.executionId,
      instances: [], // intentionally does not synthesize. It is done by the Engine at runtime.
    };
  }
}
