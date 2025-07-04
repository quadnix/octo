import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactElement;
};

const FeatureList: FeatureItem[] = [
  {
    description: (
      <>
        Docusaurus was designed from the ground up to be easily installed and used to get your website up and running
        quickly.
      </>
    ),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    title: 'Easy to Use',
  },
  {
    description: (
      <>
        Docusaurus lets you focus on your docs, and we&apos;ll do the chores. Go ahead and move your docs into the{' '}
        <code>docs</code> directory.
      </>
    ),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    title: 'Focus on What Matters',
  },
  {
    description: (
      <>
        Extend or customize your website layout by reusing React. Docusaurus can be extended while reusing the same
        header and footer.
      </>
    ),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    title: 'Powered by React',
  },
];

function Feature({ description, Svg, title }: FeatureItem): ReactElement {
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

export default function HomepageFeatures(): ReactElement {
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
