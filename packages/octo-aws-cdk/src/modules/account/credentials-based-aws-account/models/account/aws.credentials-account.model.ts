import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsCredentialsAccountSchema } from './aws.credentials-account.schema.js';

@Model<AwsCredentialsAccount>('@octo', 'account', AwsCredentialsAccountSchema)
export class AwsCredentialsAccount extends Account {
  readonly credentials: AwsCredentialsAccountSchema['credentials'];

  constructor(accountId: string, credentials: AwsCredentialsAccountSchema['credentials']) {
    super(AccountType.AWS, accountId);

    this.credentials = credentials;
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return async () => ({
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
    });
  }

  override synth(): AwsCredentialsAccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
      credentials: JSON.parse(JSON.stringify(this.credentials)),
    };
  }

  static override async unSynth(account: AwsCredentialsAccountSchema): Promise<AwsCredentialsAccount> {
    return new AwsCredentialsAccount(account.accountId, account.credentials);
  }
}
