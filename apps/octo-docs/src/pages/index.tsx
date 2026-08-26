import Head from '@docusaurus/Head';
import Layout from '@theme/Layout';
import React, { type ReactElement } from 'react';

import ClosingCta from '@site/src/components/ClosingCta';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageHero from '@site/src/components/HomepageHero';
import HowItRuns from '@site/src/components/HowItRuns';
import SupportUs from '@site/src/components/SupportUs';
import TheGraph from '@site/src/components/TheGraph';
import TheShift from '@site/src/components/TheShift';
import WhereItSits from '@site/src/components/WhereItSits';

export default function Home(): ReactElement {
  return (
    <Layout
      title="Octo"
      description="Octo is an infrastructure-as-code framework where you describe your application, and the cloud resources follow."
    >
      {/* Turns the whole page, navbar included, into one light canvas of its own. */}
      <Head>
        <body className="octo-landing" />
      </Head>

      <HomepageHero />
      <main>
        <TheShift />
        <HomepageFeatures />
        <TheGraph />
        <WhereItSits />
        <HowItRuns />
        <ClosingCta />
        <SupportUs />
      </main>
    </Layout>
  );
}
