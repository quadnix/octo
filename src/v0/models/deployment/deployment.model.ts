import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { DiffUtility } from '../../functions/diff/diff.utility';
import { IExecution } from '../execution/execution.interface';
import { Execution } from '../execution/execution.model';
import { HOOK_NAMES } from '../hook.interface';
import { Image } from '../image/image.model';
import { Model } from '../model.abstract';
import { IDeployment } from './deployment.interface';

export class Deployment extends Model<IDeployment, Deployment> {
  readonly MODEL_NAME: string = 'deployment';

  readonly deploymentTag: string;

  readonly executions: Execution[] = [];

  readonly image: Image;

  constructor(deploymentTag: string, image: Image) {
    super();
    this.deploymentTag = deploymentTag;

    this.image = image;
    // Define parent-child dependency.
    this.addDependency('deploymentTag', DiffAction.ADD, image, 'imageId', DiffAction.ADD);
    this.addDependency('deploymentTag', DiffAction.ADD, image, 'imageId', DiffAction.UPDATE);
    image.addDependency('imageId', DiffAction.DELETE, this, 'deploymentTag', DiffAction.DELETE);
  }

  addExecution(execution: Execution): void {
    // Check for duplicates.
    if (this.executions.find((e) => e.executionId === execution.executionId)) {
      throw new Error('Execution already exists!');
    }

    this.executions.push(execution);

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

    // Trigger hooks related to this event.
    this.hookService.applyHooks(HOOK_NAMES.ADD_EXECUTION);
  }

  clone(): Deployment {
    const deployment = new Deployment(this.deploymentTag, this.image);

    this.executions.forEach((execution) => {
      deployment.addExecution(execution.clone());
    });

    return deployment;
  }

  diff(previous?: Deployment): Diff[] {
    // Generate diff of all executions.
    return DiffUtility.diffModels(previous?.executions || [], this.executions, 'executionId');

    // image is intentionally not included in diff, since it can never change.
  }

  isEqual(instance: Deployment): boolean {
    return this.deploymentTag === instance.deploymentTag && this.image.imageId === instance.image.imageId;
  }

  synth(): IDeployment {
    const executions: IExecution[] = [];
    this.executions.forEach((execution) => {
      executions.push(execution.synth());
    });

    return {
      deploymentTag: this.deploymentTag,
      executions,
      imageId: this.image.imageId,
    };
  }
}
