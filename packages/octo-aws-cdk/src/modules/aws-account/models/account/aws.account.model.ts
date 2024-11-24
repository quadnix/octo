import { Account, Model } from '@quadnix/octo';
import { AwsAccountSchema } from './aws.account.schema.js';

@Model<AwsAccount>('@octo', 'account', AwsAccountSchema)
export class AwsAccount extends Account {
  constructor(accountId: string) {
    super(accountId);
  }

  static override async unSynth(account: AwsAccountSchema): Promise<AwsAccount> {
    return new AwsAccount(account.accountId);
  }
}
