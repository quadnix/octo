import { faQuoteLeftAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Heading from '@theme/Heading';
import clsx from 'clsx';
import React, { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

import styles from './styles.module.scss';

type BenefitItem = {
  title: string;
  description: ReactElement;
  icon: string;
};

const BenefitList: BenefitItem[] = [
  {
    description: (
      <>
        Octo shields developers from intricate low-level infrastructure details. Work with intuitive Models instead of
        raw cloud resources, making infrastructure accessible to your entire team.
      </>
    ),
    icon: '/img/emotes/octo-technician.png',
    title: 'Developer-Friendly Abstraction',
  },
  {
    description: (
      <>
        Built with TypeScript, Octo brings type safety, excellent IDE support, and the familiarity of one of the most
        widely used languages. Leverage existing testing frameworks and tooling.
      </>
    ),
    icon: '/img/emotes/octo-wizard.png',
    title: 'Power of TypeScript',
  },
  {
    description: (
      <>
        Visualize your infrastructure as a well-defined graph of nodes and edges. Understand relationships,
        dependencies, and changes at a glance.
      </>
    ),
    icon: '/img/emotes/octo-system-superhero.png',
    title: 'Graph-Based Infrastructure',
  },
  {
    description: (
      <>
        Shareable and reusable infrastructure components. Import modules, customize templates, and bootstrap your
        infrastructure in minutes. Community-driven, pre-tested solutions.
      </>
    ),
    icon: '/img/emotes/octo-chemist.png',
    title: 'Reusable Modules & Templates',
  },
  {
    description: (
      <>
        Differential analysis at both Model and Resource levels provides simplified and detailed insights into proposed
        changes. Understand exactly what will change before you deploy.
      </>
    ),
    icon: '/img/emotes/octo-detective.png',
    title: 'Intelligent Change Analysis',
  },
  {
    description: (
      <>
        Write infrastructure once, deploy anywhere. Octo's cloud-agnostic models work across providers. Currently
        supports AWS, with more providers coming soon.
      </>
    ),
    icon: '/img/emotes/octo-rocket.png',
    title: 'Cloud-Agnostic Design',
  },
  {
    description: (
      <>
        Octo orchestrates complex infrastructure deployments like a conductor. Coordinate multiple resources, manage
        dependencies, and ensure everything works in harmony with precise timing and sequencing.
      </>
    ),
    icon: '/img/emotes/octo-dj.png',
    title: 'Orchestrated Workflows',
  },
  {
    description: (
      <>
        Like a gardener tends to plants, Octo helps you nurture your infrastructure from seed to full bloom. Monitor
        growth, prune unnecessary resources, and cultivate a healthy, scalable environment.
      </>
    ),
    icon: '/img/emotes/octo-gardener.png',
    title: 'Nurture & Grow Infrastructure',
  },
  {
    description: (
      <>
        Handle multiple infrastructure tasks simultaneously without breaking a sweat. Octo's graph-based architecture
        allows parallel operations, making complex deployments efficient and non-blocking.
      </>
    ),
    icon: '/img/emotes/octo-multi-task.png',
    title: 'Multi-Task with Ease',
  },
  {
    description: (
      <>
        Paint your infrastructure exactly as you envision it. Octo provides the canvas and tools, while you create
        masterpieces tailored to your unique requirements. Flexibility meets creativity.
      </>
    ),
    icon: '/img/emotes/octo-painter.png',
    title: 'Customize Your Canvas',
  },
  {
    description: (
      <>
        Security is not an afterthought. Octo helps you build secure infrastructure from the ground up. Enforce security
        policies, manage access controls, and maintain compliance standards with confidence.
      </>
    ),
    icon: '/img/emotes/octo-security.png',
    title: 'Built-In Security',
  },
  {
    description: (
      <>
        Manage servers and compute resources with ease. Octo abstracts the complexity of server provisioning, scaling,
        and maintenance, letting you focus on what matters most — your application.
      </>
    ),
    icon: '/img/emotes/octo-server.png',
    title: 'Server Management Simplified',
  },
  {
    description: (
      <>
        Unlock superpowers for your infrastructure. Octo gives you capabilities that go beyond traditional IaC tools —
        intelligent modeling, graph visualization, and differential analysis that make you feel like a superhero.
      </>
    ),
    icon: '/img/emotes/octo-super.png',
    title: 'Supercharged Capabilities',
  },
  {
    description: (
      <>
        Every design decision in Octo is thoughtful and intentional. The architecture encourages best practices,
        promotes maintainability, and helps you think through infrastructure challenges before they become problems.
      </>
    ),
    icon: '/img/emotes/octo-thinking.png',
    title: 'Thoughtful Architecture',
  },
  {
    description: (
      <>
        Get more done in less time. Octo's intuitive API and powerful abstractions reduce boilerplate, eliminate
        repetitive tasks, and accelerate your infrastructure development workflow.
      </>
    ),
    icon: '/img/emotes/octo-working.png',
    title: 'Productive Development',
  },
  {
    description: (
      <>
        Experience the zen of infrastructure management. With Octo, you can find tranquility knowing your infrastructure
        is well-modeled, testable, and maintainable. Less stress, more confidence.
      </>
    ),
    icon: '/img/emotes/octo-zen-meditation.png',
    title: 'Peace of Mind',
  },
];

function Benefit({ title, description, icon, index }: BenefitItem & { index: number }): ReactElement {
  const isImageLeft = index % 2 === 0;

  return (
    <div className={styles.benefitRow}>
      {isImageLeft && (
        <div className={styles.benefitImageContainer}>
          <img src={icon} alt={title} className={styles.benefitImage} />
        </div>
      )}
      <div className={styles.benefitContent}>
        <Heading as="h3" className={styles.benefitTitle}>
          {title}
        </Heading>
        <p className={styles.benefitDescription}>{description}</p>
      </div>
      {!isImageLeft && (
        <div className={styles.benefitImageContainer}>
          <img src={icon} alt={title} className={styles.benefitImage} />
        </div>
      )}
    </div>
  );
}

export default function WhyOcto(): ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const goToNext = useCallback(() => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % BenefitList.length);
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + BenefitList.length) % BenefitList.length);
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Intersection Observer to detect if carousel is in view.
  useEffect(() => {
    const carouselElement = carouselRef.current;
    if (!carouselElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Consider "in view" when at least 80% of the carousel is visible.
          setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.8);
        });
      },
      {
        rootMargin: '0px',
        threshold: [0, 0.5, 0.8, 1], // Multiple thresholds for better detection.
      },
    );

    observer.observe(carouselElement);

    return (): void => {
      observer.disconnect();
    };
  }, []);

  // Auto-rotate only when in view and not hovered
  useEffect(() => {
    if (!isInView || isHovered) return;

    const interval = setInterval(() => {
      goToNext();
    }, 3000);

    return (): void => clearInterval(interval);
  }, [isInView, isHovered, goToNext]);

  return (
    <section
      className={styles.whyOcto}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="container">
        <div className={styles.header}>
          <Heading as="h2" className={styles.title}>
            <FontAwesomeIcon icon={faQuoteLeftAlt} size="1x" />
            &nbsp; Why Choose Octo?
          </Heading>
          <p className={styles.subtitle}>
            We believe infrastructure should be modeled around your application,
            <br />
            not low level cloud resources.
            <br />
            <br />
          </p>
          <p className={styles.subtitle}>
            It is much more intuitive to think your App has 3 Regions, vs your cloud needs to be set up with 3 VPCs, 12
            Subnets, and hundreds of other low level cloud resources.
            <br />
            <br />
          </p>
          <p className={styles.subtitle}>
            Other tools approach infrastructure as a set of cloud resources represented as code.
            <br />
            Octo offers something much more intuitive - Define infrastructure the way you think about your application,
            not the way cloud thinks about resources.
          </p>
        </div>

        <div
          className={styles.carouselWrapperContainer}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div ref={carouselRef} className={styles.carouselContainer}>
            <button
              className={clsx(styles.carouselArrow, styles.carouselArrowUp, isHovered && styles.carouselArrowVisible)}
              onClick={goToPrevious}
              aria-label="Previous benefit"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
            <div className={styles.carouselWrapper}>
              <div className={styles.carouselTrack} style={{ transform: `translateY(-${currentIndex * 100}%)` }}>
                {BenefitList.map((props, idx) => (
                  <div key={idx} className={styles.carouselSlide}>
                    <Benefit {...props} index={idx} />
                  </div>
                ))}
              </div>
            </div>
            <button
              className={clsx(styles.carouselArrow, styles.carouselArrowDown, isHovered && styles.carouselArrowVisible)}
              onClick={goToNext}
              aria-label="Next benefit"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className={styles.carouselDots}>
              {BenefitList.map((_, idx) => (
                <button
                  key={idx}
                  className={clsx(styles.carouselDot, currentIndex === idx && styles.carouselDotActive)}
                  onClick={() => goToIndex(idx)}
                  aria-label={`Go to benefit ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
