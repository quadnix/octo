import { Deployment, Model } from '@quadnix/octo';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
import type { IAwsDeployment } from './aws.deployment.interface.js';

@Model()
export class AwsDeployment extends Deployment {
  constructor(deploymentTag: string) {
    super(deploymentTag);

    const taskDefinitionAnchorId = 'TaskDefinitionAnchor';
    this.addAnchor(
      new TaskDefinitionAnchor(taskDefinitionAnchorId, { image: { command: '', ports: [], uri: '' } }, this),
    );
  }

  static override async unSynth(awsDeployment: IAwsDeployment): Promise<AwsDeployment> {
    return new AwsDeployment(awsDeployment.deploymentTag);
  }

  updateDeploymentImage(image: TaskDefinitionAnchor['properties']['image']): void {
    const taskDefinitionAnchor = this.getAnchor('TaskDefinitionAnchor') as TaskDefinitionAnchor;
    taskDefinitionAnchor.properties.image = { ...image };
  }
}
