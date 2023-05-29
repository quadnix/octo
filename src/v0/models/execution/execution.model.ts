import { Diff, DiffAction } from '../../utility/diff.utility';
import { Deployment } from '../deployment/deployment.model';
import { Environment } from '../environment/environment.model';
import { Instance } from '../instance/instance.model';
import { IModel } from '../model.interface';

export type ExecutionContext = {
  deployment: Deployment;
  environment: Environment;
};

export class Execution implements IModel<Execution> {
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
    const diff: Diff[] = [];

    for (const [key, value] of previous?.environmentVariables || new Map()) {
      if (this.environmentVariables.has(key)) {
        if (this.environmentVariables.get(key) !== value) {
          diff.push(
            new Diff(DiffAction.UPDATE, this.getContext(), 'environmentVariables', {
              key,
              value: this.environmentVariables.get(key),
            }),
          );
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previous!.getContext(), 'environmentVariables', { key, value }));
      }
    }

    for (const [key, value] of this.environmentVariables) {
      if (!previous?.environmentVariables.has(key)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'environmentVariables', { key, value }));
      }
    }

    return diff;
  }

  getContext(): string {
    return [
      `execution=${this.executionId}`,
      this.context.deployment.getContext(),
      this.context.environment.getContext(),
    ].join(',');
  }
}
