import { Diff, DiffAction, IActionInputs, IActionOutputs, Image } from '@quadnix/octo';
import { parse } from 'path';
import { EcrImage } from '../../../resources/ecr/ecr-image.resource.js';
import { SharedEcrImage } from '../../../resources/ecr/ecr-image.shared-resource.js';
import { Action } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

export class AddImageAction extends Action {
  readonly ACTION_NAME: string = 'AddImageAction';

  constructor(private readonly region: AwsRegion) {
    super();
  }

  override collectInput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`input.image.${image}.dockerExecutable`];
  }

  override collectOutput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`image-${image}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { dockerOptions, imageName, imageTag } = diff.model as Image;

    const image = `${imageName}:${imageTag}`;
    const dockerExec = actionInputs[`input.image.${image}.dockerExecutable`] as string;

    // Build command to build image.
    const dockerFileParts = parse(dockerOptions.dockerFilePath);
    const buildCommand = [dockerExec, 'build'];
    if (dockerOptions.quiet) {
      buildCommand.push('--quiet');
    }
    if (dockerOptions.buildArgs) {
      for (const key in dockerOptions.buildArgs) {
        buildCommand.push(`--build-arg ${key}=${dockerOptions.buildArgs[key]}`);
      }
    }
    buildCommand.push(`-t ${image}`);
    buildCommand.push(`-f ${dockerFileParts.base}`);
    buildCommand.push('.');

    // Create a new Image.
    const ecrImage = new EcrImage(`image-${image}`, {
      buildCommand: buildCommand.join(' '),
      dockerExec,
      dockerFileDirectory: dockerFileParts.dir,
      imageName,
      imageTag,
    });
    const sharedEcrImage = new SharedEcrImage(ecrImage);
    sharedEcrImage.markUpdated('regions', `ADD:${this.region.regionId}`);

    const output: IActionOutputs = {};
    output[ecrImage.resourceId] = sharedEcrImage;

    return output;
  }
}
