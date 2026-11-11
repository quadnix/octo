import { fromIni } from '@aws-sdk/credential-provider-ini';
import { fromSso } from '@aws-sdk/token-providers';
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
   * The earlier of when the profile's credentials and, for an SSO profile, its sign-in end. Role
   * credentials renew from the sign-in, so the sign-in is what ends a run.
   *
   * @internal
   */
  override async getCredentialsExpiresAt(): Promise<number | undefined> {
    const credentials = await fromIni({ ignoreCache: true, profile: this.iniProfile })();
    const endTimes = [credentials.expiration?.getTime()];

    // A profile without an SSO session has no sign-in to read, and its credentials resolved above.
    try {
      const token = await fromSso({ profile: this.iniProfile })();
      endTimes.push(token.expiration?.getTime());
    } catch {
      // Not an SSO profile.
    }

    const knownEndTimes = endTimes.filter((endTime) => endTime !== undefined);
    return knownEndTimes.length > 0 ? Math.min(...knownEndTimes) : undefined;
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
