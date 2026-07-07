import { Account, AccountType, Model } from '@quadnix/octo';
import { AwsMotoAccountSchema } from './aws-moto-account.schema.js';

/**
 * @internal
 */
@Model<AwsMotoAccount>('@octo', 'account', AwsMotoAccountSchema)
export class AwsMotoAccount extends Account {
  constructor(accountId: string) {
    super(AccountType.AWS, accountId);
  }

  static override async unSynth(account: AwsMotoAccountSchema): Promise<AwsMotoAccount> {
    return new AwsMotoAccount(account.accountId);
  }

  override synth(): AwsMotoAccountSchema {
    return super.synth();
  }
}
