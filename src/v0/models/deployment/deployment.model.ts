import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { DiffUtility } from '../../functions/diff/diff.utility';
import { IExecution } from '../execution/execution.interface';
import { Execution } from '../execution/execution.model';
import { Model } from '../model.abstract';
import { IDeployment } from './deployment.interface';

export class Deployment extends Model<IDeployment, Deployment> {
  readonly MODEL_NAME: string = 'deployment';

  readonly deploymentTag: string;

  readonly executions: Execution[] = [];

  constructor(deploymentTag: string) {
    super();
    this.deploymentTag = deploymentTag;
  }

  addExecution(execution: Execution): void {
    // Check for duplicates.
    if (this.executions.find((e) => e.executionId === execution.executionId)) {
      throw new Error('Execution already exists!');
    }

    // Define parent-child dependency.
    execution.addDependency('executionId', DiffAction.ADD, this, 'deploymentTag', DiffAction.ADD);
    execution.addDependency('executionId', DiffAction.ADD, this, 'deploymentTag', DiffAction.UPDATE);
    execution.addDependency('executionId', DiffAction.ADD, execution.environment, 'environmentName', DiffAction.ADD);
    execution.addDependency('executionId', DiffAction.ADD, execution.environment, 'environmentName', DiffAction.UPDATE);
    this.addDependency('deploymentTag', DiffAction.DELETE, execution, 'executionId', DiffAction.DELETE);
    execution.environment.addDependency(
      'environmentName',
      DiffAction.DELETE,
      execution,
      'executionId',
      DiffAction.DELETE,
    );

    this.executions.push(execution);
  }

  clone(): Deployment {
    const deployment = new Deployment(this.deploymentTag);

    this.executions.forEach((execution) => {
      deployment.addExecution(execution.clone());
    });

    return deployment;
  }

  diff(previous?: Deployment): Diff[] {
    // Generate diff of all executions.
    return DiffUtility.diffModels(previous?.executions || [], this.executions, 'executions', 'executionId');
  }

  synth(): IDeployment {
    const executions: IExecution[] = [];
    this.executions.forEach((execution) => {
      executions.push(execution.synth());
    });

    return {
      deploymentTag: this.deploymentTag,
      executions,
    };
  }
}
