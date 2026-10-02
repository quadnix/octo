import Link from '@docusaurus/Link';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Heading from '@theme/Heading';
import React, { type ReactElement } from 'react';

import styles from './styles.module.scss';

import gardenerImage from '@site/static/img/emotes/octo-gardener.png';
import painterImage from '@site/static/img/emotes/octo-painter.png';
import securityImage from '@site/static/img/emotes/octo-security.png';
import superheroImage from '@site/static/img/emotes/octo-system-superhero.png';
import CheckSquareSvg from '@site/static/img/icons/check-square.svg';
import CommentSvg from '@site/static/img/icons/comment.svg';
import DiscordSvg from '@site/static/img/icons/discord.svg';
import StarSvg from '@site/static/img/icons/star.svg';

type SupportOption = {
  description: string;

  /**
   * Sits opposite the icon, in the row the icon already takes up, so a card is no taller for it.
   */
  emote: string;
  href: string;
  icon?: ReactElement;
  label: string;
};

const SupportOptions: SupportOption[] = [
  {
    description: 'Star us on GitHub to show your support and help others discover Octo.',
    emote: superheroImage,
    href: 'https://github.com/quadnix/octo',
    icon: <StarSvg />,
    label: 'Star on GitHub',
  },
  {
    description: 'Contribute code, documentation, or ideas to help improve Octo.',
    emote: painterImage,
    href: 'https://github.com/quadnix/octo',
    icon: <CheckSquareSvg />,
    label: 'Contribute',
  },
  {
    description: 'Join our Discord community to connect with other Octo users and developers.',
    emote: gardenerImage,
    href: 'https://discord.gg/n8rjuwXy',
    icon: <DiscordSvg />,
    label: 'Join Discord',
  },
  {
    description: 'Share your feedback, report issues, or suggest new features.',
    emote: securityImage,
    href: 'https://github.com/quadnix/octo/issues',
    icon: <CommentSvg />,
    label: 'Share Feedback',
  },
];

/**
 * One way to support Octo, rendered as a card that opens its link in a new tab.
 */
function SupportOptionElement({ description, emote, href, icon, label }: SupportOption): ReactElement {
  return (
    <Link href={href} className={styles.supportCard} target="_blank" rel="noopener noreferrer">
      <div className={styles.supportHead}>
        <span className={styles.supportIcon}>{icon}</span>
        <img alt="" className={styles.supportEmote} src={emote} />
      </div>
      <div className={styles.supportContent}>
        <Heading as="h3" className={styles.supportTitle}>
          {label}
        </Heading>
        <p className={styles.supportDescription}>{description}</p>
      </div>
    </Link>
  );
}

/**
 * The landing page section listing the ways to support Octo.
 */
export default function SupportUs(): ReactElement {
  return (
    <section className={styles.supportUs}>
      <div className="container">
        <div className={styles.header}>
          <Heading as="h2" className={styles.title}>
            <FontAwesomeIcon icon={faHeart} className={styles.heartIcon} />
            &nbsp; Support Octo
          </Heading>
          <p className={styles.subtitle}>
            Octo is an open-source project built with passion and dedication. Your support helps us continue improving
            and maintaining this tool for the community.
          </p>
        </div>

        <div className={styles.supportGrid}>
          {SupportOptions.map((option, index) => (
            <SupportOptionElement key={index} {...option} />
          ))}
        </div>
      </div>
    </section>
  );
}
