import { DiffUtility } from '../../functions/diff/diff.utility';
import { Diff } from '../../functions/diff/diff.model';
import { Deployment } from '../deployment/deployment.model';
import { Environment } from '../environment/environment.model';
import { Instance } from '../instance/instance.model';
import { IModel } from '../model.interface';
import { IExecution } from './execution.interface';

export type ExecutionContext = {
  deployment: Deployment;
  environment: Environment;
};

export class Execution implements IModel<IExecution, Execution> {
  readonly context: ExecutionContext;

  readonly environmentVariables: Map<string, string> = new Map();

  readonly executionId: string;

  // There are intentionally no methods to add an instance,
  // since that is done only by the engine at runtime.
  // Trying to create an instance object locally would not do anything,
  // since an instance can only be constructed, never diff-ed.
  readonly instances: Instance[] = [];

  constructor(context: ExecutionContext) {
    this.context = context;
    this.executionId = [context.deployment.deploymentTag, context.environment.environmentName].join('_');
  }

  clone(): Execution {
    const execution = new Execution(this.context);

    for (const [key, value] of this.environmentVariables) {
      execution.environmentVariables.set(key, value);
    }

    this.instances.forEach((instance) => {
      execution.instances.push(new Instance(execution, instance.taskId));
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

  getContext(): string {
    return [
      `execution=${this.executionId}`,
      this.context.deployment.getContext(),
      this.context.environment.getContext(),
    ].join(',');
  }

  synth(): IExecution {
    return {
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
      executionId: this.executionId,
      instances: [], // intentionally does not synthesize. It is done by engine at runtime.
    };
  }
}
