const ACCOUNT_ID = String.raw`\d{12}`;

/**
 * Replaces AWS account numbers with a fixed token in strings captured from a live run.
 */
export class AwsAccountRedactionUtility {
  /**
   * Stands in for an AWS account number in redacted output.
   */
  static readonly TOKEN = '<AWS_ACCOUNT_ID>';

  private static readonly RULES: [RegExp, string][] = [
    // The account field of an ARN, e.g. "arn:aws:iam::123456789012:role/ServerRole-backend".
    [
      new RegExp(String.raw`(arn:aws[\w-]*:[^:\s]*:[^:\s]*:)${ACCOUNT_ID}`, 'g'),
      `$1${AwsAccountRedactionUtility.TOKEN}`,
    ],
    // The account segment of a node context, e.g. "region=us-east-1,account=123456789012,app=x".
    [new RegExp(String.raw`account=${ACCOUNT_ID}`, 'g'), `account=${AwsAccountRedactionUtility.TOKEN}`],
    // The terraform provider alias octo generates per account and region, e.g. "_123456789012-us-east-1".
    [new RegExp(String.raw`_${ACCOUNT_ID}-`, 'g'), `_${AwsAccountRedactionUtility.TOKEN}-`],
    // A value that is nothing but an account number, e.g. a security group's "owner_id".
    [new RegExp(String.raw`^${ACCOUNT_ID}$`), AwsAccountRedactionUtility.TOKEN],
  ];

  /**
   * Whether the given string carries an AWS account number this utility knows how to redact.
   */
  static hasAccountId(value: string): boolean {
    return AwsAccountRedactionUtility.redact(value) !== value;
  }

  /**
   * Returns the given string with every AWS account number replaced by {@link TOKEN}.
   */
  static redact(value: string): string {
    return AwsAccountRedactionUtility.RULES.reduce(
      (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
      value,
    );
  }
}
