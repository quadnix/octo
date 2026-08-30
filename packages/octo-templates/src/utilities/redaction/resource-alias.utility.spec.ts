import { DiffAction } from '@quadnix/octo';
import { ResourceAliasUtility } from './resource-alias.utility.js';

type Report = Parameters<typeof ResourceAliasUtility.alias>[0];
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

describe('ResourceAliasUtility UT', () => {
  describe('alias()', () => {
    it('should throw error if an identifier is owned by no terraform address', () => {
      const report = buildReport([], {
        drift: [{ address: 'aws_vpc.vpc-1', moduleId: 'region-module', tfActions: ['update'] }],
        notes: [{ message: 'saw subnet-0b2c3d4e5f6a7b8c9' }],
      });

      expect(() => ResourceAliasUtility.alias(report)).toThrow(
        'Validate report holds an identifier that no terraform address claims: subnet-0b2c3d4e5f6a7b8c9!',
      );
    });

    it('should throw error listing every identifier it cannot name', () => {
      const report = buildReport([], { notes: [{ message: 'saw vpc-0a1b2c3d4e5f6a7b8 and 203.0.113.10' }] });

      expect(() => ResourceAliasUtility.alias(report)).toThrow('203.0.113.10, vpc-0a1b2c3d4e5f6a7b8!');
    });

    it('should replace a provider-assigned counter with a token', () => {
      const report = buildReport([
        buildIntentChange('ecs-task-definition-backend', 'aws_ecs_task_definition.ecs-task-definition-backend', [
          { field: 'revision', from: '13', to: '(known after apply)' },
        ]),
      ]);

      const changedField = ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0];
      expect(changedField.from).toBe('<assigned>');
      // What the plan will do is the same on every run, so it is left as the report composed it.
      expect(changedField.to).toBe('(known after apply)');
    });

    it('should leave a counter that is not provider-assigned alone', () => {
      const report = buildReport([
        buildIntentChange('ecs-service-backend', 'aws_ecs_service.ecs-service-backend', [
          { field: 'desired_count', from: '1', to: '2' },
        ]),
      ]);

      const changedField = ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0];
      expect(changedField.from).toBe('1');
      expect(changedField.to).toBe('2');
    });

    it('should name a terraform generated name after its address', () => {
      const report = buildReport([
        buildIntentChange('alb-app-region-east', 'aws_lb.alb-app-region-east', [
          { field: 'name', from: 'terraform-1928412261f614d06a14a8017f', to: '(known after apply)' },
        ]),
      ]);

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_lb.alb-app-region-east.name>',
      );
    });

    it('should name an ELB target group id, whole and truncated, keeping the name in front of it', () => {
      const report = buildReport([
        buildIntentChange('target-group-backend', 'aws_lb_target_group.target-group-backend', [
          { field: 'arn_suffix', from: 'targetgroup/backend-v1-80/a5011f203bf2381a', to: '(known after apply)' },
          { field: 'arn', from: 'arn:aws:elasticloadbalancing:us-east-1:1234:targetgroup/backend-v1-80/a5…', to: '' },
        ]),
      ]);

      const changedFields = ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields;
      expect(changedFields[0].from).toBe(
        'targetgroup/backend-v1-80/<aws_lb_target_group.target-group-backend.arn_suffix>',
      );
      expect(changedFields[1].from).toBe(
        'arn:aws:elasticloadbalancing:us-east-1:1234:targetgroup/backend-v1-80/<aws_lb_target_group.target-group-backend.arn>…',
      );
    });

    it('should name an identifier after the address whose id it is', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'id', from: 'vpc-0a1b2c3d4e5f6a7b8', to: '(known after apply)' },
        ]),
      ]);

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_vpc.vpc-app-region-east>',
      );
    });

    it('should name a referencing identifier after the address and field that holds it', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'default_security_group_id', from: 'sg-0d4e5f6a7b8c9d0e1', to: '(known after apply)' },
        ]),
      ]);

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_vpc.vpc-app-region-east.default_security_group_id>',
      );
    });

    it('should prefer the address that identifies over the address that references', () => {
      const report = buildReport([
        buildIntentChange('subnet-app-region-east-public-subnet', 'aws_subnet.subnet-app-region-east-public-subnet', [
          { field: 'id', from: 'subnet-0c3d4e5f6a7b8c9d0', to: '(known after apply)' },
        ]),
        buildIntentChange('alb-app-region-east-qa-api-alb', 'aws_lb.alb-app-region-east-qa-api-alb', [
          { field: 'subnets', from: 'subnet-0c3d4e5f6a7b8c9d0', to: '(known after apply)' },
        ]),
      ]);
      const aliased = ResourceAliasUtility.alias(report);

      expect(aliased.intentChanges[1].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_subnet.subnet-app-region-east-public-subnet>',
      );
    });

    it('should give the same identifier the same alias everywhere it appears', () => {
      const report = buildReport([
        buildIntentChange('subnet-app-region-east-public-subnet', 'aws_subnet.subnet-app-region-east-public-subnet', [
          { field: 'id', from: 'subnet-0c3d4e5f6a7b8c9d0', to: '(known after apply)' },
          { field: 'arn', from: 'arn:aws:ec2:us-east-1::subnet/subnet-0c3d4e5f6a7b8c9d0', to: '(none)' },
        ]),
      ]);
      const changedFields = ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields;

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
              changedFields: [{ field: 'id', from: 'sgr-0e5f6a7b8c9d0e1f2', to: '(known after apply)' }],
              tfActions: ['update'],
            },
            {
              address: 'aws_vpc_security_group_egress_rule.sec-grp-backend_egress_0',
              changedFields: [{ field: 'id', from: 'sgr-0f6a7b8c9d0e1f2a3', to: '(known after apply)' }],
              tfActions: ['update'],
            },
          ],
        },
      ]);
      const terraformChanges = ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges;

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
          { field: 'subnets', from: 'subnet-0c3d4e5f6a7b8c9d0, subnet-0b2c3d4e5f6a7b8c9', to: '(none)' },
        ]),
      ]);

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_lb.alb-app-region-east-qa-api-alb.subnets[0]>, <aws_lb.alb-app-region-east-qa-api-alb.subnets[1]>',
      );
    });

    it('should alias a bare ip address', () => {
      const report = buildReport([
        buildIntentChange('nat-gateway-app-region-east', 'aws_nat_gateway.nat-gateway-app-region-east', [
          { field: 'public_ip', from: '203.0.113.10', to: '(known after apply)' },
        ]),
      ]);

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].from).toBe(
        '<aws_nat_gateway.nat-gateway-app-region-east.public_ip>',
      );
    });

    it('should leave a cidr block alone', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'cidr_block', from: '10.0.0.0/16', to: '10.1.0.0/16' },
        ]),
      ]);

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0]).toEqual({
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

      expect(ResourceAliasUtility.alias(report).intentChanges[0].terraformChanges[0].changedFields[0].to).toBe(
        'vpc-0123456789abcdef0',
      );
    });

    it('should keep a key whose value is undefined', () => {
      const report = buildReport([
        buildIntentChange('vpc-app-region-east', 'aws_vpc.vpc-app-region-east', [
          { field: 'id', from: 'vpc-0a1b2c3d4e5f6a7b8' },
        ]),
      ]);
      const aliased = ResourceAliasUtility.alias(report);

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

      expect(ResourceAliasUtility.alias(report)).toEqual(report);
    });
  });
});
