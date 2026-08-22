import { AwsAccountRedactionUtility } from './aws-account-redaction.utility.js';

describe('AwsAccountRedactionUtility UT', () => {
  it('should set static members', () => {
    expect(AwsAccountRedactionUtility.TOKEN).toBe('<AWS_ACCOUNT_ID>');
  });

  describe('hasAccountId()', () => {
    it('should be false for a string with no account number', () => {
      expect(AwsAccountRedactionUtility.hasAccountId('arn:aws:s3:::shop-receipts')).toBe(false);
    });

    it('should be false for a string already redacted', () => {
      expect(AwsAccountRedactionUtility.hasAccountId('arn:aws:iam::<AWS_ACCOUNT_ID>:role/ServerRole-backend')).toBe(
        false,
      );
    });

    it('should be true for a string with an account number', () => {
      expect(AwsAccountRedactionUtility.hasAccountId('arn:aws:iam::123456789012:role/ServerRole-backend')).toBe(true);
    });
  });

  describe('redact()', () => {
    it('should leave a string with no account number alone', () => {
      expect(AwsAccountRedactionUtility.redact('vpc-0d8d555c656b950ad')).toBe('vpc-0d8d555c656b950ad');
    });

    it('should not redact a 12 digit number inside a longer value', () => {
      expect(AwsAccountRedactionUtility.redact('x123456789012x')).toBe('x123456789012x');
    });

    it('should redact the account field of an arn', () => {
      expect(AwsAccountRedactionUtility.redact('arn:aws:iam::123456789012:role/ServerRole-backend')).toBe(
        'arn:aws:iam::<AWS_ACCOUNT_ID>:role/ServerRole-backend',
      );
    });

    it('should redact the account field of a regional arn', () => {
      expect(AwsAccountRedactionUtility.redact('arn:aws:ecs:us-east-1:123456789012:cluster/app-region-east-qa')).toBe(
        'arn:aws:ecs:us-east-1:<AWS_ACCOUNT_ID>:cluster/app-region-east-qa',
      );
    });

    it('should redact every account number in a string', () => {
      expect(
        AwsAccountRedactionUtility.redact(
          'arn:aws:ec2:us-east-1:123456789012:vpc/vpc-1 arn:aws:ec2:us-east-1:123456789012:vpc/vpc-2',
        ),
      ).toBe('arn:aws:ec2:us-east-1:<AWS_ACCOUNT_ID>:vpc/vpc-1 arn:aws:ec2:us-east-1:<AWS_ACCOUNT_ID>:vpc/vpc-2');
    });

    it('should redact the account segment of a node context', () => {
      expect(AwsAccountRedactionUtility.redact('region=app-region-east,account=123456789012,app=aws-ecs-server')).toBe(
        'region=app-region-east,account=<AWS_ACCOUNT_ID>,app=aws-ecs-server',
      );
    });

    it('should redact a terraform provider alias', () => {
      expect(AwsAccountRedactionUtility.redact('provider = aws._123456789012-us-east-1')).toBe(
        'provider = aws._<AWS_ACCOUNT_ID>-us-east-1',
      );
    });

    it('should redact a value that is nothing but an account number', () => {
      expect(AwsAccountRedactionUtility.redact('123456789012')).toBe('<AWS_ACCOUNT_ID>');
    });
  });
});
