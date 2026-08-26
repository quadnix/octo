import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';
import Reveal from '@site/src/components/Reveal';
import djImage from '@site/static/img/emotes/octo-dj.png';
import multiTaskImage from '@site/static/img/emotes/octo-multi-task.png';
import superImage from '@site/static/img/emotes/octo-super.png';

type PointItem = {
  description: string;
  image: string;
  title: string;
};

const PointList: PointItem[] = [
  {
    description:
      'Every connection carries the order it has to happen in, including the ones no tool can work out on ' +
      'its own. Take a permission away before deleting the thing it names, and Octo already knows, because ' +
      'whoever built the piece wrote it down once.',
    image: djImage,
    title: 'It knows what has to happen first',
  },
  {
    description:
      'Every part of the picture remembers which building block created it. You can see exactly what one of ' +
      'them owns, what crosses between them, and what would move if you swapped one out for another.',
    image: multiTaskImage,
    title: 'You can see where the lines are',
  },
  {
    description:
      'Octo keeps the picture between runs, so a change is a comparison of two of them rather than a fresh ' +
      'guess. That is how it can tell what you asked for apart from what simply turned up.',
    image: superImage,
    title: 'It remembers what it looked like before',
  },
];

/**
 * The picture the section is about: five things, the connections between them, and the dashed
 * boundary of the building block that produced each one.
 */
function GraphFigure(): ReactElement {
  return (
    <svg className={styles.svg} viewBox="0 0 660 372" role="img" aria-label="Octo's graph of an application">
      <defs>
        <marker id="graphArrow" markerHeight="6" markerWidth="7" orient="auto" refX="6" refY="3">
          <path d="M0 0 L7 3 L0 6 z" fill="#b9c6d8" />
        </marker>
      </defs>

      {/* Module boundaries. */}
      <g className={styles.boundary}>
        <rect height="92" rx="14" width="174" x="28" y="140" />
        <text x="42" y="160">app module</text>
        <rect height="92" rx="14" width="174" x="238" y="12" />
        <text x="252" y="32">account module</text>
        <rect height="92" rx="14" width="174" x="458" y="12" />
        <text x="472" y="32">region module</text>
        <rect height="92" rx="14" width="174" x="238" y="140" />
        <text x="252" y="160">server module</text>
        <rect height="92" rx="14" width="174" x="238" y="268" />
        <text x="252" y="288">receipts module</text>
      </g>

      {/* Edges. */}
      <g className={styles.edge}>
        <path d="M190 196 C 220 196, 220 68, 250 68" markerEnd="url(#graphArrow)" />
        <path d="M190 196 L 244 196" markerEnd="url(#graphArrow)" />
        <path d="M190 196 C 220 196, 220 314, 250 314" markerEnd="url(#graphArrow)" />
        <path d="M400 68 L 464 68" markerEnd="url(#graphArrow)" />
      </g>

      {/* The relationship that crosses two boundaries, which is the point of the picture. */}
      <g className={styles.overlayEdge}>
        <path d="M380 222 L 380 288" />
        <text x="392" y="260">reads and writes</text>
      </g>

      {/* Nodes. */}
      <g className={styles.node}>
        <rect height="52" rx="10" width="150" x="40" y="170" />
        <text className={styles.nodeKind} x="56" y="191">
          app
        </text>
        <text className={styles.nodeName} x="56" y="209">
          shop
        </text>

        <rect height="52" rx="10" width="150" x="250" y="42" />
        <text className={styles.nodeKind} x="266" y="63">
          account
        </text>
        <text className={styles.nodeName} x="266" y="81">
          123456789012
        </text>

        <rect height="52" rx="10" width="150" x="470" y="42" />
        <text className={styles.nodeKind} x="486" y="63">
          region
        </text>
        <text className={styles.nodeName} x="486" y="81">
          eu-west-1
        </text>

        <rect height="52" rx="10" width="150" x="250" y="170" />
        <text className={styles.nodeKind} x="266" y="191">
          server
        </text>
        <text className={styles.nodeName} x="266" y="209">
          checkout
        </text>

        <rect height="52" rx="10" width="150" x="250" y="298" />
        <text className={styles.nodeKind} x="266" y="319">
          service
        </text>
        <text className={styles.nodeName} x="266" y="337">
          receipts
        </text>
      </g>
    </svg>
  );
}

export default function TheGraph(): ReactElement {
  return (
    <section className={styles.section}>
      <div className="container">
        <Reveal>
          <div className={styles.header}>
            <span className={styles.eyebrow}>The graph</span>
            <Heading as="h2" className={styles.title}>
              Your infrastructure, as a picture you can actually read
            </Heading>
            <p className={styles.subtitle}>
              Octo is built on a graph, so what you get is not a pile of files. It is your application drawn out:
              every piece, every connection between them, and a boundary around the part each building block owns.
              The same picture covers what you asked for and what exists in the cloud underneath it.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className={styles.figure}>
            <div className={styles.svgScroll}>
              <GraphFigure />
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendMark} ${styles.legendSolid}`} aria-hidden="true" />
                one thing belongs to another
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendMark} ${styles.legendDashed}`} aria-hidden="true" />
                one thing uses another
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendMark} ${styles.legendBox}`} aria-hidden="true" />
                what one building block owns
              </span>
            </div>
          </div>
        </Reveal>

        <div className={styles.points}>
          {PointList.map((point) => (
            <Reveal key={point.title}>
              <article className={styles.point}>
                <img alt="" className={styles.pointImage} src={point.image} />
                <Heading as="h3" className={styles.pointTitle}>
                  {point.title}
                </Heading>
                <p className={styles.pointDescription}>{point.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
