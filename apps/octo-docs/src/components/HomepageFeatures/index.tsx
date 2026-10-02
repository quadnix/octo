import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Reveal from '@site/src/components/Reveal';
import chemistImage from '@site/static/img/emotes/octo-chemist.png';
import detectiveImage from '@site/static/img/emotes/octo-detective.png';
import technicianImage from '@site/static/img/emotes/octo-technician.png';
import thinkingImage from '@site/static/img/emotes/octo-thinking.png';

type FeatureItem = {
  /**
   * What Octo does about the problem above it. It sits in a paragraph of its own and is set apart,
   * because it is the line a reader should come away with.
   */
  answer: string;

  /**
   * A small worked picture of the claim the card makes, in the same shape as the panels above:
   * a few plain words rather than a code sample to read.
   */
  figure: ReactElement;
  image: string;
  problem: string;
  span: 'narrow' | 'wide';
  title: string;
};

const FeatureList: FeatureItem[] = [
  {
    answer:
      'Octo works out what that takes in the cloud, so the words you maintain are the ones your team already uses.',
    figure: (
      <div className={styles.figure}>
        <span className={styles.figureQuote}>“checkout needs somewhere to keep receipts”</span>
        <span className={styles.figureLabel}>becomes</span>
        <span className={styles.figureChips}>
          <span className={styles.chip}>bucket</span>
          <span className={styles.chip}>bucket policy</span>
          <span className={styles.chip}>role attachment</span>
        </span>
      </div>
    ),
    image: thinkingImage,
    problem: 'Describe the thing you are building: an application, the places it runs, the services it needs.',
    span: 'wide',
    title: 'Say what you want, not how to build it',
  },
  {
    answer:
      'Octo lets you package it once, with what it needs and what it hands back written on the outside, so anyone ' +
      'can use it without reading a line of what is inside.',
    figure: (
      <div className={styles.figure}>
        <span className={styles.moduleName}>our standard region</span>
        <span className={styles.moduleRow}>
          <em className={styles.moduleKey}>you give it</em>
          <span className={styles.chip}>an account</span>
          <span className={styles.chip}>a name</span>
        </span>
        <span className={styles.moduleRow}>
          <em className={styles.moduleKey}>you get back</em>
          <span className={`${styles.chip} ${styles.chipAccent}`}>a working region</span>
        </span>
      </div>
    ),
    image: chemistImage,
    problem:
      'Every team has its own answer to “how do we set up networking here?”, and today that answer is buried in ' +
      'config that only works where it was written.',
    span: 'narrow',
    title: 'Package your setup once, use it anywhere',
  },
  {
    answer: 'Octo checks every connection while it works out your intent, before a single line of Terraform exists.',
    figure: (
      <div className={styles.figure}>
        <span className={styles.timelineRow}>
          <em className={styles.timelineWho}>Today</em>
          <span className={styles.step}>write</span>
          <span className={styles.stepArrow} aria-hidden="true" />
          <span className={styles.step}>plan</span>
          <span className={styles.stepArrow} aria-hidden="true" />
          <span className={`${styles.step} ${styles.stepFail}`}>apply ✕</span>
        </span>
        <span className={styles.timelineNote}>half your infrastructure exists, and you clean it up by hand</span>
        <span className={styles.timelineRow}>
          <em className={styles.timelineWho}>Octo</em>
          <span className={`${styles.step} ${styles.stepFail}`}>check ✕</span>
          <span className={styles.stepArrow} aria-hidden="true" />
          <span className={`${styles.step} ${styles.stepMuted}`}>plan</span>
          <span className={styles.stepArrow} aria-hidden="true" />
          <span className={`${styles.step} ${styles.stepMuted}`}>apply</span>
        </span>
        <span className={`${styles.timelineNote} ${styles.timelineNoteGood}`}>
          it never got that far, so nothing was created
        </span>
      </div>
    ),
    image: technicianImage,
    problem:
      'Point something at the wrong thing in Terraform and nothing complains until the provider rejects it, ' +
      'part-way through creating your infrastructure, with half a stack standing.',
    span: 'narrow',
    title: 'Errors caught while you build, not while you deploy',
  },
  {
    answer:
      'Octo reviews your intent itself, with the cloud changes listed underneath it, and reports anything your ' +
      'intent does not explain as drift.',
    figure: (
      <div className={styles.figure}>
        <span className={styles.reviewGood}>
          <span className={styles.reviewMark} aria-hidden="true">
            ✓
          </span>
          in your intent
        </span>
        <span className={styles.reviewLine}>checkout can now read receipts</span>
        <span className={styles.reviewSub}>+ bucket policy, + role attachment</span>
        <span className={styles.reviewBad}>
          <span className={styles.reviewMark} aria-hidden="true">
            ⚠
          </span>
          drift
        </span>
        <span className={styles.reviewSub}>nothing in your intent explains this</span>
      </div>
    ),
    image: detectiveImage,
    problem:
      'A plan shows you buckets, policies and roles. It cannot show you the intent behind them, because by then ' +
      'the intent is gone.',
    span: 'wide',
    title: 'Review what was meant, not a wall of resource changes',
  },
];

/**
 * One card in the features grid: the problem, how Octo answers it, and its figure.
 */
function Feature({ answer, figure, image, problem, span, title }: FeatureItem): ReactElement {
  return (
    <article className={`${styles.card} ${span === 'wide' ? styles.cardWide : styles.cardNarrow}`}>
      <div className={styles.cardHead}>
        <img alt="" className={styles.cardImage} src={image} />
        <Heading as="h3" className={styles.cardTitle}>
          {title}
        </Heading>
      </div>
      <p className={styles.cardProblem}>{problem}</p>
      <p className={styles.cardAnswer}>{answer}</p>
      {figure}
    </article>
  );
}

/**
 * The landing page section listing what Octo gives the people who maintain infrastructure.
 */
export default function HomepageFeatures(): ReactElement {
  return (
    <section className={styles.section}>
      <div className="container">
        <Reveal>
          <div className={styles.header}>
            <span className={styles.eyebrow}>What you get</span>
            <Heading as="h2" className={styles.title}>
              Built for the people who have to explain it later
            </Heading>
          </div>
        </Reveal>

        <div className={styles.featureGrid}>
          {FeatureList.map((props) => (
            <Reveal key={props.title} className={props.span === 'wide' ? styles.slotWide : styles.slotNarrow}>
              <Feature {...props} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
