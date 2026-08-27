import { fromIni } from '@aws-sdk/credential-provider-ini';
import { Account, AccountType, Model } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsIniAccountSchema } from './aws-ini-account.schema.js';

/**
 * @internal
 */
@Model<AwsIniAccount>('@octo', 'account', AwsIniAccountSchema)
export class AwsIniAccount extends Account {
  readonly iniProfile: string;

  /**
   * @internal
   */
  constructor(accountId: string, iniProfile: string) {
    super(AccountType.AWS, accountId);

    this.iniProfile = iniProfile;
  }

  /**
   * @internal
   */
  static override async unSynth(account: AwsIniAccountSchema): Promise<AwsIniAccount> {
    return new AwsIniAccount(account.accountId, account.iniProfile);
  }

  /**
   * Resolves the named profile out of the shared AWS config files, when it is asked for.
   *
   * @internal
   */
  override getCredentials(): AwsCredentialIdentityProvider {
    return fromIni({ profile: this.iniProfile });
  }

  /**
   * @internal
   */
  override synth(): AwsIniAccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
      iniProfile: this.iniProfile,
    };
  }
}
