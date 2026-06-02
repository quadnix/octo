import {
  Action,
  type ActionOutputs,
  App,
  Container,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../../../../../factories/octo-terraform.factory.js';
import type { SimpleAppModule } from '../../../simple-app.module.js';

/**
 * @internal
 */
@Action(App)
export class AddSimpleAppModelAction implements IModelAction<SimpleAppModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof App &&
      hasNodeName(diff.node, 'app') &&
      diff.field === 'name'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<SimpleAppModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const octoTerraform = await Container.getInstance().get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });
    octoTerraform.addTerraformConfig();

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddSimpleAppModelAction>(AddSimpleAppModelAction)
export class AddSimpleAppModelActionFactory {
  private static instance: AddSimpleAppModelAction;

  static async create(): Promise<AddSimpleAppModelAction> {
    if (!this.instance) {
      this.instance = new AddSimpleAppModelAction();
    }
    return this.instance;
  }
}
