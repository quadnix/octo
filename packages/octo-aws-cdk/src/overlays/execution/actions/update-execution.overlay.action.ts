import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import { ExecutionOverlay } from '../execution.overlay.js';

@Action(NodeType.OVERLAY)
export class UpdateExecutionOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateExecutionOverlayAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof ExecutionOverlay &&
      diff.node.NODE_NAME === 'execution-overlay' &&
      diff.field === 'anchor'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<UpdateExecutionOverlayAction>(UpdateExecutionOverlayAction)
export class UpdateExecutionOverlayActionFactory {
  static async create(): Promise<UpdateExecutionOverlayAction> {
    return new UpdateExecutionOverlayAction();
  }
}
