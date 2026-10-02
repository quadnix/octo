import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Reveal from '@site/src/components/Reveal';

type StepItem = {
  badge: string;
  detail: string;
  name: string;
  tone: 'safe' | 'writes';
};

type DetailItem = {
  description: string;
  title: string;
};

/**
 * The four lifecycle commands. The badges are the part worth knowing before you run one: the first
 * two cannot touch your cloud account at all.
 */
const StepList: StepItem[] = [
  { badge: 'no credentials', detail: 'Works out what you asked for and writes the Terraform.', name: 'generate', tone: 'safe' },
  { badge: 'creates nothing', detail: 'Plans it, and reports the plan against what you asked for.', name: 'validate', tone: 'safe' },
  { badge: 'takes the lock', detail: 'Creates the infrastructure, through Terraform.', name: 'apply', tone: 'writes' },
  { badge: 'frees the lock', detail: 'Records what was created, ready for the next run.', name: 'commit', tone: 'writes' },
];

const DetailList: DetailItem[] = [
  {
    description:
      'Octo is not a black box in the middle. It writes ordinary Terraform, one folder per building block, ' +
      'and those files land in your repository where a reviewer can read them next to the change that ' +
      'caused them. Your existing pipeline runs them.',
    title: 'It writes Terraform you can read',
  },
  {
    description:
      'Two runs cannot fight over the same infrastructure. The steps that change things take a lock first, ' +
      'and a second runner stops immediately, naming who holds it, before it plans anything at all.',
    title: 'Two pipelines cannot collide',
  },
  {
    description:
      'Every run leaves a page you can browse of what happened, and the same thing as data. That is what you ' +
      'post on a pull request so the person approving it sees the intent, not four hundred lines of ' +
      'resource changes.',
    title: 'Every run leaves a report',
  },
];

function Step({ badge, detail, name, tone }: StepItem): ReactElement {
  return (
    <li className={styles.step}>
      <span className={styles.stepName}>{name}</span>
      <span className={`${styles.stepBadge} ${tone === 'safe' ? styles.stepBadgeSafe : styles.stepBadgeWrites}`}>
        {badge}
      </span>
      <span className={styles.stepDetail}>{detail}</span>
    </li>
  );
}

export default function HowItRuns(): ReactElement {
  return (
    <section className={styles.section}>
      <div className="container">
        <Reveal>
          <div className={styles.header}>
            <span className={styles.eyebrow}>How it runs</span>
            <Heading as="h2" className={styles.title}>
              Four commands, and nothing hidden in between
            </Heading>
            <p className={styles.subtitle}>
              Octo does not replace anything in your toolchain. It adds the step above it, where the decisions get
              made, and hands the result to the tools you already run.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <ol className={styles.steps}>
            {StepList.map((step) => (
              <Step key={step.name} {...step} />
            ))}
          </ol>
        </Reveal>

        <div className={styles.details}>
          {DetailList.map((detail) => (
            <Reveal key={detail.title}>
              <article className={styles.detail}>
                <Heading as="h3" className={styles.detailTitle}>
                  {detail.title}
                </Heading>
                <p className={styles.detailDescription}>{detail.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
