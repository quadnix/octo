import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Typewriter from '@site/src/components/Typewriter';
import mascotImage from '@site/static/img/emotes/octo-mascot.png';

export default function HomepageHero(): ReactElement {
  return (
    <header className={styles.hero}>
      <div className={styles.heroAurora} aria-hidden="true" />
      <div className={styles.heroGrid} aria-hidden="true" />

      <div className={`container ${styles.heroInner}`}>
        <div className={styles.heroText}>
          <Heading as="h1" className={styles.heroTitle}>
            <span className={styles.heroTitleAccent}>Intent-based</span> infrastructure.
          </Heading>

          <p className={styles.heroLead}>Your intent, converted to cloud infrastructure.</p>

          <p className={styles.heroSubtitle}>
            Octo is an infrastructure-as-code framework. You describe your application: its accounts, regions,
            environments, servers and services. Octo derives the cloud resources those imply, writes the Terraform, and
            keeps the intent behind every resource it creates.
          </p>

          <div className={styles.heroButtons}>
            <Link className={styles.buttonPrimary} to="/docs/getting-started/installation">
              Get started
            </Link>
            <Link className={styles.buttonGhost} to="/docs/why-octo">
              See how it works
            </Link>
          </div>

          <p className={styles.heroHint}>
            <span className={styles.heroHintLabel}>The question you stop having to ask</span>
            <span className={styles.heroHintQuote}>
              who asked for this{' '}
              <span className={styles.heroHintWord}>
                <Typewriter suffix="?" words={['VPC', 'IAM role', 'subnet', 'security group', 'NAT gateway']} />
              </span>
            </span>
          </p>
        </div>

        <div className={styles.orb}>
          <span className={styles.orbDisc} aria-hidden="true" />
          <span className={styles.orbTrack} aria-hidden="true" />
          <span className={`${styles.orbTrack} ${styles.orbTrackInner}`} aria-hidden="true" />
          <span className={styles.orbArc} aria-hidden="true" />
          <span className={`${styles.orbArc} ${styles.orbArcInner}`} aria-hidden="true" />
          <img alt="" className={styles.orbImage} src={mascotImage} />
        </div>
      </div>
    </header>
  );
}
