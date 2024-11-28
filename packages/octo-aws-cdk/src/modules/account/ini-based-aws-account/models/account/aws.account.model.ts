import { fromIni } from '@aws-sdk/credential-providers';
import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsAccountSchema } from './aws.account.schema.js';

@Model<AwsAccount>('@octo', 'account', AwsAccountSchema)
export class AwsAccount extends Account {
  readonly iniProfile: string;

  constructor(accountId: string, iniProfile: string) {
    super(AccountType.AWS, accountId);

    this.iniProfile = iniProfile;
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return fromIni({ profile: this.iniProfile });
  }

  override synth(): AwsAccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
      iniProfile: this.iniProfile,
    };
  }

  static override async unSynth(account: AwsAccountSchema): Promise<AwsAccount> {
    return new AwsAccount(account.accountId, account.iniProfile);
  }
}
