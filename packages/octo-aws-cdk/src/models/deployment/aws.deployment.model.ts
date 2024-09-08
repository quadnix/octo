import { Deployment, Model, ModelError } from '@quadnix/octo';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
import { TaskDefinitionUtility } from '../../utilities/task-definition/task-definition.utility.js';
import type { IAwsDeployment } from './aws.deployment.interface.js';

@Model()
export class AwsDeployment extends Deployment {
  constructor(deploymentTag: string) {
    super(deploymentTag);

    const taskDefinitionAnchorId = 'TaskDefinitionAnchor';
    this.addAnchor(
      new TaskDefinitionAnchor(
        taskDefinitionAnchorId,
        { cpu: 256, image: { command: '', ports: [], uri: '' }, memory: 512 },
        this,
      ),
    );
  }

  static override async unSynth(awsDeployment: IAwsDeployment): Promise<AwsDeployment> {
    return new AwsDeployment(awsDeployment.deploymentTag);
  }

  updateDeploymentCpuAndMemory(
    cpu: TaskDefinitionAnchor['properties']['cpu'],
    memory: TaskDefinitionAnchor['properties']['memory'],
  ): void {
    if (!TaskDefinitionUtility.isCpuAndMemoryValid(cpu, memory)) {
      throw new ModelError('Invalid values for CPU and/or memory!', this);
    }

    const taskDefinitionAnchor = this.getAnchor('TaskDefinitionAnchor') as TaskDefinitionAnchor;
    taskDefinitionAnchor.properties.cpu = cpu;
    taskDefinitionAnchor.properties.memory = memory;
  }

  updateDeploymentImage(image: TaskDefinitionAnchor['properties']['image']): void {
    const taskDefinitionAnchor = this.getAnchor('TaskDefinitionAnchor') as TaskDefinitionAnchor;
    taskDefinitionAnchor.properties.image = { ...image };
  }
}
