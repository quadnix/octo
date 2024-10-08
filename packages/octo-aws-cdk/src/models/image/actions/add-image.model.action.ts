import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  Image,
  NodeType,
} from '@quadnix/octo';
import { parse } from 'path';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';

@Action(NodeType.MODEL)
export class AddImageModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddImageModelAction';

  collectInput(): string[] {
    return ['input.image.dockerExecutable'];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Image &&
      diff.node.NODE_NAME === 'image' &&
      diff.field === 'imageId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const { dockerOptions, imageId } = diff.node as Image;

    const dockerExec = actionInputs['input.image.dockerExecutable'] as string;

    // Build command to build image.
    const dockerfileParts = parse(dockerOptions.dockerfilePath);
    const buildCommand = [dockerExec, 'build'];
    if (dockerOptions.quiet) {
      buildCommand.push('--quiet');
    }
    if (dockerOptions.buildArgs) {
      for (const key in dockerOptions.buildArgs) {
        buildCommand.push(`--build-arg ${key}=${dockerOptions.buildArgs[key]}`);
      }
    }
    buildCommand.push(`-t ${imageId}`);
    buildCommand.push(`-f ${dockerfileParts.base}`);
    buildCommand.push('.');

    // Build image.
    const buildRunner = ProcessUtility.runDetachedProcess(
      buildCommand.join(' '),
      { cwd: dockerfileParts.dir, shell: true },
      'pipe',
    );
    await new Promise<void>((resolve, reject) => {
      buildRunner.on('error', (error) => {
        buildRunner.removeAllListeners();

        buildRunner.kill();
        reject(error);
      });
      buildRunner.on('exit', (code) => {
        buildRunner.removeAllListeners();

        if (code !== 0) {
          reject(new Error(`Build failed with exit code: ${code}`));
        } else {
          resolve();
        }
      });
    });

    return actionOutputs;
  }
}

@Factory<AddImageModelAction>(AddImageModelAction)
export class AddImageModelActionFactory {
  static async create(): Promise<AddImageModelAction> {
    return new AddImageModelAction();
  }
}
