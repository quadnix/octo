import { Diff, DiffAction, IActionInputs, IActionOutputs, Image } from '@quadnix/octo';
import { SharedEcrImage } from '../../../resources/ecr/ecr-image.shared-resource';
import { Action } from '../../action.abstract';
import { AwsRegion } from '../../region/aws.region.model';

export class DeleteImageAction extends Action {
  readonly ACTION_NAME: string = 'DeleteImageAction';

  constructor(private readonly region: AwsRegion) {
    super();
  }

  override collectInput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`resource.image-${image}`];
  }

  override collectOutput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`image-${image}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    const sharedEcrImage = actionInputs[`resource.image-${image}`] as SharedEcrImage;
    sharedEcrImage.markUpdated('regions', `DELETE:${this.region.regionId}`);

    const output: IActionOutputs = {};
    output[`image-${image}`] = sharedEcrImage;

    return output;
  }
}
