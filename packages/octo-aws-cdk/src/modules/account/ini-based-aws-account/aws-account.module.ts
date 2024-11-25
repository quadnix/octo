import { AModule, App, Module, Schema } from '@quadnix/octo';
import { AwsAccount } from './models/account/index.js';

export class AwsAccountModuleSchema {
  accountId = Schema<string>();

  app = Schema<App>();
}

@Module<AwsAccountModule>('@octo', AwsAccountModuleSchema)
export class AwsAccountModule extends AModule<AwsAccountModuleSchema, AwsAccount> {
  async onInit(inputs: AwsAccountModuleSchema): Promise<AwsAccount> {
    const app = inputs.app;

    // Create a new account.
    const account = new AwsAccount(inputs.accountId);
    app.addAccount(account);

    return account;
  }
}
