import { DiffAction } from '@quadnix/octo';
import { AwsResourceAliasUtility } from './aws-resource-alias.utility.js';

type Report = Parameters<typeof AwsResourceAliasUtility.alias>[0];
type IntentChange = Report['intentChanges'][0];

const buildReport = (intentChanges: IntentChange[], overrides: Partial<Report> = {}): Report => ({
  attributedChanges: [],
  confidence: 'exact',
  drift: [],
  failures: [],
  intentChanges,
  notes: [],
  uncertain: [],
  ...overrides,
});

const buildIntentChange = (
  resourceId: string,
  address: string,
  changedFields: { field: string; from?: string; to?: string }[],
): IntentChange => ({
  moduleId: 'region-module',
  octoAction: DiffAction.UPDATE,
  reason: undefined,
  resourceContext: `@octo/resource=${resourceId}`,
  resourceId,
  terraformChanges: [{ address, changedFields, tfActions: ['update'] }],
});

describe('AwsResourceAliasUtility UT', () => {
  it('should set static members', () => {
    expect(AwsResourceAliasUtility.PLACEHOLDER_SUFFIX).toBe('0123456789abcdef0');
  });

  describe('alias()', () => {
    it('should throw error if an identifier is owned by no terraform address', () => {
      const report = buildReport([], {
        drift: [{ address: 'aws_vpc.vpc-1', moduleId: 'region-module', tfActions: ['update'] }],
        notes: [{ message: 'saw subnet-013a66645b3b4cd15' }],
      });

      expect(() => AwsResourceAliasUtility.alias(report)).toThrow(
        'Validate report holds an AWS identifier that no terraform address claims: subnet-013a66645b3b4cd15!',
      );
    });

    it('should throw error listing every identifier it cannot name', () => {
      const report = buildReport([], { notes: [{ message: 'saw vpc-0e5d50288289a080f and 54.209.242.119' }] });

      expect(() => AwsResourceAliasUtility.alias(report)).toThrow('54.209.242.119, vpc-0e5d50288289a080f!');
    });

    it('should name an identifier after the address whose id it is', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'id', from: 'vpc-0e5d50288289a080f', to: '(known after apply)' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_vpc.vpc-app-region-east>',
      );
    });

    it('should name a referencing identifier after the address and field that holds it', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'default_security_group_id', from: 'sg-0129d4a8d73429a53', to: '(known after apply)' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_vpc.vpc-app-region-east.default_security_group_id>',
      );
    });

    it('should prefer the address that identifies over the address that references', () => {
      const report = buildReport([
        buildIntentChange('subnet-app-region-east-public-subnet', 'aws_subnet.subnet-app-region-east-public-subnet', [
          { field: 'id', from: 'subnet-06782045873e361dc', to: '(known after apply)' },
        ]),
        buildIntentChange('alb-app-region-east-qa-api-alb', 'aws_lb.alb-app-region-east-qa-api-alb', [
          { field: 'subnets', from: 'subnet-06782045873e361dc', to: '(known after apply)' },
        ]),
      ]);
      const aliased = AwsResourceAliasUtility.alias(report);

      expect(aliased.intentChanges[1].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_subnet.subnet-app-region-east-public-subnet>',
      );
    });

    it('should give the same identifier the same alias everywhere it appears', () => {
      const report = buildReport([
        buildIntentChange('subnet-app-region-east-public-subnet', 'aws_subnet.subnet-app-region-east-public-subnet', [
          { field: 'id', from: 'subnet-06782045873e361dc', to: '(known after apply)' },
          { field: 'arn', from: 'arn:aws:ec2:us-east-1::subnet/subnet-06782045873e361dc', to: '(none)' },
        ]),
      ]);
      const changedFields = AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields;

      expect(changedFields[0].from).toBe('<aws_subnet.subnet-app-region-east-public-subnet>');
      expect(changedFields[1].from).toBe(
        'arn:aws:ec2:us-east-1::subnet/<aws_subnet.subnet-app-region-east-public-subnet>',
      );
    });

    it('should keep identifiers distinct when their addresses share a resource id', () => {
      const report = buildReport([
        {
          ...buildIntentChange('sec-grp-backend', 'unused', []),
          terraformChanges: [
            {
              address: 'aws_vpc_security_group_ingress_rule.sec-grp-backend_ingress_0',
              changedFields: [{ field: 'id', from: 'sgr-0184139cf14954317', to: '(known after apply)' }],
              tfActions: ['update'],
            },
            {
              address: 'aws_vpc_security_group_egress_rule.sec-grp-backend_egress_0',
              changedFields: [{ field: 'id', from: 'sgr-01edf92f632e6b072', to: '(known after apply)' }],
              tfActions: ['update'],
            },
          ],
        },
      ]);
      const terraformChanges = AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges;

      expect(terraformChanges[0].changedFields[0].from).toBe(
        '<aws_vpc_security_group_ingress_rule.sec-grp-backend_ingress_0>',
      );
      expect(terraformChanges[1].changedFields[0].from).toBe(
        '<aws_vpc_security_group_egress_rule.sec-grp-backend_egress_0>',
      );
    });

    it('should index two identifiers listed in one field', () => {
      const report = buildReport([
        buildIntentChange('alb-app-region-east-qa-api-alb', 'aws_lb.alb-app-region-east-qa-api-alb', [
          { field: 'subnets', from: 'subnet-06782045873e361dc, subnet-013a66645b3b4cd15', to: '(none)' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_lb.alb-app-region-east-qa-api-alb.subnets[0]>, <aws_lb.alb-app-region-east-qa-api-alb.subnets[1]>',
      );
    });

    it('should alias a bare ip address', () => {
      const report = buildReport([
        buildIntentChange('nat-gateway-app-region-east', 'aws_nat_gateway.nat-gateway-app-region-east', [
          { field: 'public_ip', from: '54.209.242.119', to: '(known after apply)' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_nat_gateway.nat-gateway-app-region-east.public_ip>',
      );
    });

    it('should leave a cidr block alone', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'cidr_block', from: '10.0.0.0/16', to: '10.1.0.0/16' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0]).toEqual({
        field: 'cidr_block',
        from: '10.0.0.0/16',
        to: '10.1.0.0/16',
      });
    });

    it('should leave a placeholder identifier alone', () => {
      const report = buildReport([
        buildIntentChange('subnet-app-region-east-public-subnet', 'aws_subnet.subnet-app-region-east-public-subnet', [
          { field: 'vpc_id', from: '(none)', to: 'vpc-0123456789abcdef0' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].to).toBe(
        'vpc-0123456789abcdef0',
      );
    });

    it('should keep a key whose value is undefined', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'id', from: 'vpc-0e5d50288289a080f' },
        ]),
      ]);
      const aliased = AwsResourceAliasUtility.alias(report);

      expect(Object.keys(aliased.intentChanges[0])).toContain('reason');
      expect(aliased.intentChanges[0].reason).toBeUndefined();
      expect(Object.keys(aliased.intentChanges[0].terraformChanges[0].changedFields[0])).toEqual(['field', 'from']);
    });

    it('should leave a report with no identifiers unchanged', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'tags', from: '(none)', to: '3 item(s)' },
        ]),
      ]);

      expect(AwsResourceAliasUtility.alias(report)).toEqual(report);
    });
  });
});
