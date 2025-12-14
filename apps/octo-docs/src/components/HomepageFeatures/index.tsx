import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';

type FeatureItem = {
  description: ReactElement;
  icon: string;
  title: string;
};

const FeatureList: FeatureItem[] = [
  {
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
];

function Feature({ description, icon, title }: FeatureItem): ReactElement {
  return (
    <div className={styles.featureCard}>
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
