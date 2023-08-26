import { Diff, DiffAction, IAction, IActionInputs, IActionOutputs, Image } from '@quadnix/octo';
import { parse } from 'path';
import { EcrImage } from '../../../resources/ecr/ecr-image.resource';

export class AddImageAction implements IAction<IActionInputs, IActionOutputs> {
  readonly ACTION_NAME: string = 'AddImageAction';

  collectInput(diff: Diff): string[] {
    const image = diff.model as Image;

    return [`input.image.${image.imageName}:${image.imageTag}.dockerExecutable`];
  }

  collectOutput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`image-${image}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  handle(diff: Diff, actionInput: IActionInputs): IActionOutputs {
    const { dockerOptions, imageName, imageTag } = diff.model as Image;

    const dockerExec = actionInput[`input.image.${imageName}:${imageTag}.dockerExecutable`] as string;
    const image = `${imageName}:${imageTag}`;

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

    const output: IActionOutputs = {};
    output[ecrImage.resourceId] = ecrImage;

    return output;
  }

  revert(): IActionOutputs {
    return {};
  }
}
