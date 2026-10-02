import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Reveal from '@site/src/components/Reveal';
import zenImage from '@site/static/img/emotes/octo-zen-meditation.png';

/**
 * The last section of the landing page, pointing the reader at installation and the introduction.
 */
export default function ClosingCallToAction(): ReactElement {
  return (
    <section className={styles.section}>
      <span className={styles.glow} aria-hidden="true" />
      <div className="container">
        <Reveal>
          <div className={styles.inner}>
            <img alt="" className={styles.image} src={zenImage} />
            <Heading as="h2" className={styles.title}>
              Write down what you meant.
            </Heading>
            <p className={styles.subtitle}>
              Octo keeps the intent behind every resource, so the next person to read your infrastructure does not have
              to guess.
            </p>
            <div className={styles.buttons}>
              <Link className={styles.buttonPrimary} to="/docs/getting-started/installation">
                Get started
              </Link>
              <Link className={styles.buttonGhost} to="/docs/introduction">
                Read the introduction
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
