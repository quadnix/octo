import { Deployment, Model } from '@quadnix/octo';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
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
    const taskDefinitionAnchor = this.getAnchor('TaskDefinitionAnchor') as TaskDefinitionAnchor;
    taskDefinitionAnchor.properties.cpu = cpu;
    taskDefinitionAnchor.properties.memory = memory;
  }

  updateDeploymentImage(image: TaskDefinitionAnchor['properties']['image']): void {
    const taskDefinitionAnchor = this.getAnchor('TaskDefinitionAnchor') as TaskDefinitionAnchor;
    taskDefinitionAnchor.properties.image = { ...image };
  }
}
