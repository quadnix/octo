import { RedactionUtility } from './redaction.utility.js';

// Not a real account, and deliberately not one of the allowed placeholders, so it is the value these
// tests expect to be replaced.
const ACCOUNT_ID = '210987654321';

describe('RedactionUtility UT', () => {
  describe('redactionRules()', () => {
    it('should return only rules that carry a token', () => {
      expect(RedactionUtility.redactionRules().every((rule) => rule.token !== null)).toBe(true);
      expect(RedactionUtility.redactionRules().map((rule) => rule.name)).toEqual(['AWS account id']);
    });
  });

  describe('identifierRules()', () => {
    it('should return only rules whose value is named from its context', () => {
      expect(RedactionUtility.identifierRules().every((rule) => rule.token === null)).toBe(true);
      expect(RedactionUtility.identifierRules().map((rule) => rule.name)).toEqual([
        'AWS resource id',
        'ELB target group id',
        'IP address',
        'Terraform generated name',
      ]);
    });
  });

  describe('findMatches()', () => {
    it('should return nothing when no rule matches', () => {
      expect(RedactionUtility.findMatches('nothing here', RedactionUtility.identifierRules())).toEqual([]);
    });

    it('should not return a value a rule allows', () => {
      expect(RedactionUtility.findMatches('vpc-0123456789abcdef0', RedactionUtility.identifierRules())).toEqual([]);
    });

    it('should return every match of the given rules', () => {
      expect(
        RedactionUtility.findMatches('subnet-013a66645b3b4cd15 at 203.0.113.10', RedactionUtility.identifierRules()),
      ).toEqual(['subnet-013a66645b3b4cd15', '203.0.113.10']);
    });

    it('should not return an identifier when asked for redaction rules', () => {
      expect(RedactionUtility.findMatches('subnet-013a66645b3b4cd15', RedactionUtility.redactionRules())).toEqual([]);
    });
  });

  describe('hasSecret()', () => {
    it('should be false for a string with no account number', () => {
      expect(RedactionUtility.hasSecret('arn:aws:s3:::shop-receipts')).toBe(false);
    });

    it('should be false for a string already redacted', () => {
      expect(RedactionUtility.hasSecret('arn:aws:iam::<AWS_ACCOUNT_ID>:role/ServerRole-backend')).toBe(false);
    });

    it('should be false for a resource identifier, which is aliased rather than redacted', () => {
      expect(RedactionUtility.hasSecret('subnet-013a66645b3b4cd15')).toBe(false);
    });

    it('should be true for a string with an account number', () => {
      expect(RedactionUtility.hasSecret(`arn:aws:iam::${ACCOUNT_ID}:role/ServerRole-backend`)).toBe(true);
    });
  });

  describe('redact()', () => {
    it('should leave a string with nothing to redact alone', () => {
      expect(RedactionUtility.redact('vpc-0d8d555c656b950ad')).toBe('vpc-0d8d555c656b950ad');
    });

    it('should not redact a 12 digit number inside a longer value', () => {
      expect(RedactionUtility.redact(`x${ACCOUNT_ID}x`)).toBe(`x${ACCOUNT_ID}x`);
    });

    it('should not redact the documentation placeholder', () => {
      expect(RedactionUtility.redact('arn:aws:iam::123456789012:role/ServerRole-backend')).toBe(
        'arn:aws:iam::123456789012:role/ServerRole-backend',
      );
    });

    it("should not redact terragrunt's own mock output", () => {
      expect(RedactionUtility.redact('arn:aws:iam::000000000000:role/mock-role')).toBe(
        'arn:aws:iam::000000000000:role/mock-role',
      );
    });

    it('should redact the account field of an arn', () => {
      expect(RedactionUtility.redact(`arn:aws:iam::${ACCOUNT_ID}:role/ServerRole-backend`)).toBe(
        'arn:aws:iam::<AWS_ACCOUNT_ID>:role/ServerRole-backend',
      );
    });

    it('should redact the account field of a regional arn', () => {
      expect(RedactionUtility.redact(`arn:aws:ecs:us-east-1:${ACCOUNT_ID}:cluster/app-region-east-qa`)).toBe(
        'arn:aws:ecs:us-east-1:<AWS_ACCOUNT_ID>:cluster/app-region-east-qa',
      );
    });

    it('should redact every account number in a string', () => {
      expect(
        RedactionUtility.redact(
          `arn:aws:ec2:us-east-1:${ACCOUNT_ID}:vpc/vpc-1 arn:aws:ec2:us-east-1:${ACCOUNT_ID}:vpc/vpc-2`,
        ),
      ).toBe('arn:aws:ec2:us-east-1:<AWS_ACCOUNT_ID>:vpc/vpc-1 arn:aws:ec2:us-east-1:<AWS_ACCOUNT_ID>:vpc/vpc-2');
    });

    it('should redact the account segment of a node context', () => {
      expect(RedactionUtility.redact(`region=app-region-east,account=${ACCOUNT_ID},app=aws-ecs-server`)).toBe(
        'region=app-region-east,account=<AWS_ACCOUNT_ID>,app=aws-ecs-server',
      );
    });

    it('should redact a terraform provider alias', () => {
      expect(RedactionUtility.redact(`provider = aws._${ACCOUNT_ID}-us-east-1`)).toBe(
        'provider = aws._<AWS_ACCOUNT_ID>-us-east-1',
      );
    });

    it('should redact a value that is nothing but an account number', () => {
      expect(RedactionUtility.redact(ACCOUNT_ID)).toBe('<AWS_ACCOUNT_ID>');
    });
  });
});
