import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Reveal from '@site/src/components/Reveal';
import rocketImage from '@site/static/img/emotes/octo-rocket.png';
import serverImage from '@site/static/img/emotes/octo-server.png';
import wizardImage from '@site/static/img/emotes/octo-wizard.png';
import workingImage from '@site/static/img/emotes/octo-working.png';

type PointItem = {
  /**
   * What Octo does about the point above it, set apart so a skim lands on this line.
   */
  answer: string;
  image: string;
  problem: string;
  title: string;
};

const PointList: PointItem[] = [
  {
    answer:
      'Octo works out what you meant and writes the code. Everything below it is what you already run, ' +
      'and pointing it at OpenTofu instead of Terraform changes nothing above.',
    image: serverImage,
    problem:
      'Adopting a new infrastructure tool usually means moving off the one you have, and relearning how a deploy ' +
      'works.',
    title: 'Nothing to rip out',
  },
  {
    answer:
      'When you want a building block of your own, you write it in TypeScript, with real types, the autocomplete ' +
      'you already get, and the test runner you already use.',
    image: workingImage,
    problem:
      'The only file most people ever open is a YAML file, listing the pieces they want and the values those take.',
    title: 'YAML to use it, TypeScript to extend it',
  },
  {
    answer:
      'In Octo the cloud lives in the building blocks, not in what you write, so the same description can be ' +
      'pointed at another provider, or split across two. The blocks we publish today cover AWS, and anything ' +
      'else needs its own written first.',
    image: rocketImage,
    problem:
      'Terraform names its provider on every line, which is what makes moving between clouds, or mixing two of ' +
      'them, a rewrite rather than a decision.',
    title: 'Your description never names a cloud',
  },
  {
    answer:
      'One command writes you a working project from a template, and there are more for when you want a building ' +
      'block, a model or a resource of your own.',
    image: wizardImage,
    problem:
      'Picking up a new tool usually starts with an empty directory and a page of setup you copy from somewhere ' +
      'else.',
    title: 'You never start from a blank file',
  },
];

/**
 * The stack, top to bottom. It exists to answer one question before it is asked: what of my current
 * setup does this replace, and the answer is none of it.
 */
function StackFigure(): ReactElement {
  return (
    <svg className={styles.svg} viewBox="0 0 620 388" role="img" aria-label="Where Octo sits among your tools">
      <defs>
        <marker id="stackArrow" markerHeight="7" markerWidth="8" orient="auto" refX="4" refY="6">
          <path d="M0 0 L4 6 L8 0" fill="none" stroke="#b9c6d8" strokeWidth="1.5" />
        </marker>
      </defs>

      <g className={styles.flow}>
        <path d="M310 84 L310 100" markerEnd="url(#stackArrow)" />
        <path d="M310 180 L310 196" markerEnd="url(#stackArrow)" />
        <path d="M310 276 L310 292" markerEnd="url(#stackArrow)" />
      </g>

      {/* You */}
      <g className={styles.layer}>
        <rect height="74" rx="14" width="500" x="60" y="8" />
        <text className={styles.layerTitle} x="84" y="40">
          You
        </text>
        <text className={styles.layerSub} x="84" y="62">
          describe your application in one YAML file
        </text>
      </g>

      {/* Octo */}
      <g className={styles.layerOcto}>
        <rect height="74" rx="14" width="500" x="60" y="104" />
        <text className={styles.layerTitleOcto} x="84" y="136">
          Octo
        </text>
        <text className={styles.layerSubOcto} x="84" y="158">
          works out what you meant, and writes the code
        </text>
        <rect className={styles.badge} height="24" rx="12" width="94" x="442" y="129" />
        <text className={styles.badgeText} x="489" y="145">
          TypeScript
        </text>
      </g>

      {/* The tools that do the work */}
      <g className={styles.layer}>
        <rect height="74" rx="14" width="500" x="60" y="200" />
        <g className={styles.tool}>
          <rect height="24" rx="7" width="82" x="84" y="216" />
          <text x="125" y="232">
            Terraform
          </text>
          <rect height="24" rx="7" width="78" x="176" y="216" />
          <text x="215" y="232">
            OpenTofu
          </text>
          <rect height="24" rx="7" width="88" x="264" y="216" />
          <text x="308" y="232">
            Terragrunt
          </text>
        </g>
        <text className={styles.layerSub} x="84" y="258">
          plan it, apply it, and run the pieces in the right order
        </text>
      </g>

      {/* The cloud */}
      <g className={styles.layer}>
        <rect height="74" rx="14" width="500" x="60" y="296" />
        <text className={styles.layerTitle} x="84" y="328">
          Your cloud
        </text>
        <text className={styles.layerSub} x="84" y="350">
          what exists, and what each piece of it was for
        </text>
      </g>
    </svg>
  );
}

export default function WhereItSits(): ReactElement {
  return (
    <section className={styles.section}>
      <div className="container">
        <Reveal>
          <div className={styles.header}>
            <span className={styles.eyebrow}>Where it sits</span>
            <Heading as="h2" className={styles.title}>
              It sits on top of the tools you already run
            </Heading>
            <p className={styles.subtitle}>
              Octo is not a replacement for Terraform, and it is not a new cloud to learn. It is the layer above
              them, where the decisions get made and written down.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className={styles.figure}>
            <div className={styles.svgScroll}>
              <StackFigure />
            </div>
            <p className={styles.versions}>
              Works with Terraform or OpenTofu 1.6 and newer, Terragrunt 0.78 and newer, on Node 20 and newer.
            </p>
          </div>
        </Reveal>

        <div className={styles.points}>
          {PointList.map((point) => (
            <Reveal key={point.title}>
              <article className={styles.point}>
                <div className={styles.pointHead}>
                  <img alt="" className={styles.pointImage} src={point.image} />
                  <Heading as="h3" className={styles.pointTitle}>
                    {point.title}
                  </Heading>
                </div>
                <p className={styles.pointProblem}>{point.problem}</p>
                <p className={styles.pointAnswer}>{point.answer}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
