import { fromIni } from '@aws-sdk/credential-providers';
import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsIniAccountSchema } from './aws.ini-account.schema.js';

/**
 * @internal
 */
@Model<AwsIniAccount>('@octo', 'account', AwsIniAccountSchema)
export class AwsIniAccount extends Account {
  readonly iniProfile: string;

  constructor(accountId: string, iniProfile: string) {
    super(AccountType.AWS, accountId);

    this.iniProfile = iniProfile;
  }

  override getCredentials(): AwsCredentialIdentityProvider {
    return fromIni({ profile: this.iniProfile });
  }

  override synth(): AwsIniAccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
      iniProfile: this.iniProfile,
    };
  }

  static override async unSynth(account: AwsIniAccountSchema): Promise<AwsIniAccount> {
    return new AwsIniAccount(account.accountId, account.iniProfile);
  }
}
