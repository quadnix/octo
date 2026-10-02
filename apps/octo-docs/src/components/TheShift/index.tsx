import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Reveal from '@site/src/components/Reveal';

/**
 * The wall on the left is texture rather than content. It is set small and dimmed and fades out at
 * the bottom, because the point being made is how much of it there is, not what any line says.
 */
const CloudPrimitives: string[] = [
  'aws_vpc',
  'aws_subnet',
  'aws_route_table',
  'aws_route_table_association',
  'aws_network_acl',
  'aws_network_acl_rule',
  'aws_security_group',
  'aws_security_group_rule',
  'aws_internet_gateway',
  'aws_nat_gateway',
  'aws_eip',
  'aws_iam_role',
  'aws_iam_policy',
  'aws_iam_role_policy_attachment',
  'aws_iam_instance_profile',
  'aws_ecs_cluster',
  'aws_ecs_service',
  'aws_ecs_task_definition',
  'aws_lb',
  'aws_lb_listener',
  'aws_lb_target_group',
  'aws_s3_bucket',
  'aws_s3_bucket_policy',
  'aws_s3_bucket_public_access_block',
  'aws_cloudwatch_log_group',
  'aws_ecr_repository',
  'aws_efs_file_system',
  'aws_efs_mount_target',
  'aws_dynamodb_table',
  'aws_service_discovery_service',
  'aws_vpc_endpoint',
  'aws_launch_template',
];

const IntentWords: string[] = ['app', 'account', 'region', 'environment', 'server', 'service'];

/**
 * The landing page section contrasting the cloud resources you write today with the intent Octo takes instead.
 */
export default function TheShift(): ReactElement {
  return (
    <section className={styles.section}>
      <div className="container">
        <Reveal>
          <div className={styles.header}>
            <span className={styles.eyebrow}>The shift</span>
            <Heading as="h2" className={styles.statement}>
              Octo is an infrastructure-as-code framework where you describe{' '}
              <span className={styles.statementAccent}>your application</span>, and the cloud resources follow.
            </Heading>
          </div>
        </Reveal>

        <Reveal>
          <div className={styles.panels}>
            <div className={`${styles.panel} ${styles.panelBefore}`}>
              <span className={styles.panelLabel}>What you maintain today</span>
              <div className={styles.wall} aria-hidden="true">
                {CloudPrimitives.map((primitive) => (
                  <span key={primitive} className={styles.wallItem}>
                    {primitive}
                  </span>
                ))}
              </div>
              <p className={styles.panelCaption}>Cloud primitives, and no record of what any of them are for.</p>
            </div>

            <div className={styles.divider} aria-hidden="true">
              <span className={styles.dividerLine} />
              <span className={styles.dividerBadge}>Octo</span>
              <span className={styles.dividerLine} />
            </div>

            <div className={`${styles.panel} ${styles.panelAfter}`}>
              <span className={styles.panelLabel}>What you maintain with Octo</span>
              <div className={styles.words}>
                {IntentWords.map((word) => (
                  <span key={word} className={styles.word}>
                    {word}
                  </span>
                ))}
              </div>
              <p className={styles.panelCaption}>The words your team already uses. The cloud is derived from them.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
