import { Account, AccountType, Model } from '@quadnix/octo';
import { AwsLocalstackAccountSchema } from './aws-localstack-account.schema.js';

/**
 * @internal
 */
@Model<AwsLocalstackAccount>('@octo', 'account', AwsLocalstackAccountSchema)
export class AwsLocalstackAccount extends Account {
  constructor(accountId: string) {
    super(AccountType.AWS, accountId);
  }

  static override async unSynth(account: AwsLocalstackAccountSchema): Promise<AwsLocalstackAccount> {
    return new AwsLocalstackAccount(account.accountId);
  }

  override synth(): AwsLocalstackAccountSchema {
    return super.synth();
  }
}
