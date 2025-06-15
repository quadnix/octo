import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsAccountSchema } from './aws.account.schema.js';

@Model<AwsAccount>('@octo', 'account', AwsAccountSchema)
export class AwsAccount extends Account {
  constructor(accountId: string) {
    super(AccountType.AWS, accountId);
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return async () => ({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    });
  }

  override synth(): AwsAccountSchema {
    return super.synth();
  }

  static override async unSynth(account: AwsAccountSchema): Promise<AwsAccount> {
    return new AwsAccount(account.accountId);
  }
}
