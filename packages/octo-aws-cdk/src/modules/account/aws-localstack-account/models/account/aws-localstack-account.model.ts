import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsLocalstackAccountSchema } from './aws-localstack-account.schema.js';

/**
 * @internal
 */
@Model<AwsLocalstackAccount>('@octo', 'account', AwsLocalstackAccountSchema)
export class AwsLocalstackAccount extends Account {
  constructor(accountId: string) {
    super(AccountType.AWS, accountId);
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return async () => ({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    });
  }

  override synth(): AwsLocalstackAccountSchema {
    return super.synth();
  }

  static override async unSynth(account: AwsLocalstackAccountSchema): Promise<AwsLocalstackAccount> {
    return new AwsLocalstackAccount(account.accountId);
  }
}
