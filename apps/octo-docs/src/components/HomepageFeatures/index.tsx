import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';

type FeatureItem = {
  additionalClassName?: string;
  description: ReactElement;
  icon: string;
  title: string;
};

const FeatureList: FeatureItem[] = [
  {
    additionalClassName: 'featureImageGraphs',
    description: (
      <>
        We promised visualization, and its about to become a reality!
        <br />
        With Octo UI you can generate real time graphs of your infrastructure. You can chart models, dive deep into
        cloud resources, or highlight how different components network together.
        <br />
        Take the guesswork out, and take control of your infrastructure.
      </>
    ),
    icon: '/img/octo-landing-page-graph-preview.png',
    title: 'Graphs, Baby! (Coming Soon)',
  },
  {
    additionalClassName: 'featureImagePipeline',
    description: (
      <>
        With Octo Pipelines your infrastructure changes are just a PR away.
        <br />
        Setup Pipelines to run Octo on every pull request and automatically apply infrastructure changes.
        <br />
        Watch logs. Enforce PR rules. Detailed diffs. HTML Reports. And more!
      </>
    ),
    icon: '/img/octo-landing-page-pipeline-preview.png',
    title: 'Octo CD Pipeline! (Coming Soon)',
  },
];

function Feature({ additionalClassName, description, icon, title }: FeatureItem): ReactElement {
  return (
    <div className={`${styles.featureCard} ${styles[additionalClassName]}`}>
      <div className={styles.featureContent}>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p className={styles.featureDescription}>{description}</p>
      </div>
      <div className={styles.featureImage}>
        <img src={icon} alt={title} />
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactElement {
  return (
    <section className={styles.features}>
      <div className="container">
        {FeatureList.map((props, idx) => (
          <Feature key={idx} {...props} />
        ))}
      </div>
    </section>
  );
}
