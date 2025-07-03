import Heading from '@theme/Heading';
import clsx from 'clsx';
import React from 'react';

import styles from './styles.module.scss';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: React.JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    description: (
      <>
        Octo CDK is designed to be simple for developers and DevOps alike. Its model allows clear separation of concerns
        while offering ample opportunities for extension and remodeling by DevOps teams.
      </>
    ),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    title: 'Simple for devs, flexible for DevOps',
  },
  {
    description: (
      <>
        Octo analyzes infrastructure diffs at both model and resource levels, offering detailed insights. It supports
        transactions for individual changes with rollback capability for errors.
      </>
    ),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    title: 'Diffs & Transaction Support',
  },
  {
    description: (
      <>
        Octo modeling is graph-based, depicting infrastructure and its relationships. Built in TypeScript, Octo
        leverages TS benefits, such as robust testing frameworks and the familiarity of a widely-used language.
      </>
    ),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    title: 'Powered by Graphs & TypeScript',
  },
];

function Feature({ title, Svg, description }: FeatureItem): React.JSX.Element {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): React.JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
