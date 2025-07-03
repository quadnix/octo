import Link from '@docusaurus/Link';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import React from 'react';

import styles from './styles.module.scss';

function HomepageHeader(): React.JSX.Element {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className={clsx('hero__title', styles.hero__title)}>
          <span className={clsx(styles.hero__title__highlight)}>Infrastructure made simple.</span>
        </Heading>
        <p className={clsx('hero__subtitle', styles.hero__subtitle)}>
          Octo is a general-purpose cloud infrastructure modeling and management tool.
          <br />
          Made easy for developers and devops alike.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/introduction">
            Let's Begin! 🚀
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): React.JSX.Element {
  return (
    <Layout title={`Octo - Infrastructure Modeling`} description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
