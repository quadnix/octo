import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsAccountSchema } from './aws.account.schema.js';

@Model<AwsAccount>('@octo', 'account', AwsAccountSchema)
export class AwsAccount extends Account {
  readonly credentials: AwsAccountSchema['credentials'];

  constructor(accountId: string, credentials: AwsAccountSchema['credentials']) {
    super(AccountType.AWS, accountId);

    this.credentials = credentials;
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return async () => ({
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
    });
  }

  override synth(): AwsAccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
      credentials: JSON.parse(JSON.stringify(this.credentials)),
    };
  }

  static override async unSynth(account: AwsAccountSchema): Promise<AwsAccount> {
    return new AwsAccount(account.accountId, account.credentials);
  }
}
