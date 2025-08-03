import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsMotoAccountSchema } from './aws-moto-account.schema.js';

/**
 * @internal
 */
@Model<AwsMotoAccount>('@octo', 'account', AwsMotoAccountSchema)
export class AwsMotoAccount extends Account {
  constructor(accountId: string) {
    super(AccountType.AWS, accountId);
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return async () => ({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    });
  }

  override synth(): AwsMotoAccountSchema {
    return super.synth();
  }

  static override async unSynth(account: AwsMotoAccountSchema): Promise<AwsMotoAccount> {
    return new AwsMotoAccount(account.accountId);
  }
}
