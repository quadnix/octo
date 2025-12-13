import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Typewriter from '@site/src/components/Typewriter';
import WhyOcto from '@site/src/components/WhyOcto';
import mascotImage from '@site/static/img/emotes/octo-mascot.png';
import backgroundImage from '@site/static/img/octo-landing-page-bg.jpg';

function HomepageHeader(): ReactElement {
  return (
    <header className={clsx('hero', styles.heroBanner)} style={{ backgroundImage: `url(${backgroundImage})` }}>
      <div className="container">
        <div className={styles.heroTitleContainer}>
          <div>
            <Heading as="h1" className={clsx('hero__title', styles.hero__title)}>
              <span className={clsx(styles.hero__title__highlight)}>
                Infrastructure made <Typewriter words={['simple', 'amazing', 'awesome', 'powerful', 'intuitive']} />
              </span>
            </Heading>
            <p className={clsx('hero__subtitle', styles.hero__subtitle)}>
              Octo is a general-purpose cloud infrastructure modeling and management tool.
              <br />
              Made easy for <b>developers</b> and <b>devops</b> alike.
            </p>
          </div>

          <div className={styles.mascotContainer}>
            <img src={mascotImage} alt="Octo Mascot" className={styles.mascotImage} />
          </div>
        </div>

        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/introduction">
            Let's Begin! 🚀
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactElement {
  return (
    <Layout title={`Octo - Infrastructure Modeling`} description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <WhyOcto />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
