import { DiffAction } from '@quadnix/octo';
import { type ValidateReport, renderValidateReport } from './validate-report.renderer.js';

/**
 * An empty report, to be spread over. Keeps each test's literal down to the one section it is about.
 */
const emptyReport = (): ValidateReport => ({
  attributedChanges: [],
  confidence: 'exact',
  drift: [],
  failures: [],
  intentChanges: [],
  notes: [],
  uncertain: [],
});

describe('renderValidateReport()', () => {
  it('renders a terraform change attributed to an identity that moved', () => {
    // Renaming an execution deletes the old target group and adds a new one. The alb listener kept
    // its own id, so octo never flagged it, but its rendered `target_group.arn` now points at a
    // different address and terraform plans an update. The report names the cause.
    const report: ValidateReport = {
      ...emptyReport(),
      attributedChanges: [
        {
          address: 'aws_lb_listener.alb-listener-qa-api-alb',
          causeKind: 'identity-changed',
          causeResourceId: 'alb-target-group-backend-v1-qa-execution',
          moduleId: 'qa-api-alb-module',
          tfActions: ['update'],
        },
      ],
      confidence: 'approximate',
      intentChanges: [
        {
          moduleId: 'backend-v1-qa-execution-module',
          octoAction: DiffAction.DELETE,
          resourceContext: '@octo/alb-target-group=alb-target-group-backend-v1-qa-execution',
          resourceId: 'alb-target-group-backend-v1-qa-execution',
          terraformChanges: [
            { address: 'aws_lb_target_group.alb-target-group-backend-v1-qa-execution', tfActions: ['delete'] },
          ],
        },
        {
          moduleId: 'backend-v1-qa-execution-module',
          octoAction: DiffAction.ADD,
          resourceContext: '@octo/alb-target-group=alb-target-group-changed-execution-id',
          resourceId: 'alb-target-group-changed-execution-id',
          terraformChanges: [
            { address: 'aws_lb_target_group.alb-target-group-changed-execution-id', tfActions: ['create'] },
          ],
        },
      ],
    };

    expect(renderValidateReport(report)).toMatchSnapshot();
  });

  it('renders an intent change that costs no infrastructure', () => {
    const report: ValidateReport = {
      ...emptyReport(),
      confidence: 'approximate',
      intentChanges: [
        {
          moduleId: 'backend-v1-qa-execution-module',
          octoAction: DiffAction.UPDATE,
          resourceContext: '@octo/alb-target-group=alb-target-group-backend-v1-qa-execution',
          resourceId: 'alb-target-group-backend-v1-qa-execution',
          terraformChanges: [
            { address: 'aws_lb_target_group.alb-target-group-backend-v1-qa-execution', tfActions: ['update'] },
          ],
        },
        {
          moduleId: 'backend-v1-qa-execution-module',
          octoAction: DiffAction.UPDATE,
          resourceContext: '@octo/ecs-service=ecs-service-backend-v1-qa-execution',
          resourceId: 'ecs-service-backend-v1-qa-execution',
          terraformChanges: [],
        },
      ],
    };

    expect(renderValidateReport(report)).toMatchSnapshot();
  });

  it('renders drift with the advice to act on it', () => {
    const report: ValidateReport = {
      ...emptyReport(),
      drift: [
        {
          address: 'aws_nat_gateway.nat-gateway-app-region-east-public-subnet',
          moduleId: 'public-subnet-module',
          tfActions: ['create'],
        },
        {
          address: 'aws_eip.nat-gateway-app-region-east-public-subnet_eip',
          moduleId: 'public-subnet-module',
          tfActions: ['create'],
        },
      ],
    };

    expect(renderValidateReport(report)).toMatchSnapshot();
  });

  it('never presents an uncertain entry as drift', () => {
    const report: ValidateReport = {
      ...emptyReport(),
      confidence: 'approximate',
      uncertain: [
        {
          address: 'aws_ecs_service.ecs-service-backend-v1-qa-execution',
          moduleId: 'backend-v1-qa-execution-module',
          reason:
            'planned against a "mock_outputs" placeholder: it consumes an output of ' +
            '"iam-role-ServerRole-changed-backend", which has never been applied, so the value terraform compared ' +
            'against is not the value it will get',
          tfActions: ['create', 'delete'],
        },
      ],
    };

    const rendered = renderValidateReport(report);

    expect(rendered).toContain('UNCERTAIN');
    expect(rendered).toContain('No drift detected.');
    expect(rendered).not.toContain('DRIFT');
    expect(rendered).toMatchSnapshot();
  });

  it('leads with a failure, because everything below it is incomplete', () => {
    const report: ValidateReport = {
      ...emptyReport(),
      failures: [
        {
          message:
            'Terraform failed to plan module "region-module":\n' +
            'Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set',
          moduleId: 'region-module',
        },
      ],
      notes: [
        {
          message: 'Terraform plan supplied for folder "user-module", which octo does not track.',
          moduleId: 'user-module',
        },
      ],
    };

    expect(renderValidateReport(report)).toMatchSnapshot();
  });
});
