import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { BRAND_FORMAT, BRAND_VARIATION, getBrand } from './src/utilities/brand.utility';

const config: Config = {
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',
  favicon: 'img/favicon.ico',
  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html language. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  markdown: {
    mermaid: true,
  },
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: getBrand(BRAND_VARIATION.ORG, BRAND_FORMAT.CAPITALIZE),
  plugins: ['docusaurus-plugin-sass'],
  presets: [
    [
      'classic',
      {
        blog: {
          // Please change this to your repository.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          showReadingTime: true,
        },
        docs: {
          // Please change this to your repository.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          sidebarPath: './sidebars.ts',
        },
        theme: {
          customCss: './src/css/custom.scss',
        },
      } satisfies Preset.Options,
    ],
  ],
  projectName: getBrand(),
  tagline: 'Dinosaurs are cool',
  themeConfig: {
    footer: {
      copyright: `Copyright © ${new Date().getFullYear()} ${getBrand(BRAND_VARIATION.ORG, BRAND_FORMAT.CAPITALIZE)}.`,
      links: [
        {
          items: [
            {
              label: 'Tutorial',
              to: '/docs/intro',
            },
          ],
          title: 'Docs',
        },
        {
          items: [
            {
              href: 'https://stackoverflow.com/questions/tagged/docusaurus',
              label: 'Stack Overflow',
            },
            {
              href: 'https://discordapp.com/invite/docusaurus',
              label: 'Discord',
            },
            {
              href: 'https://twitter.com/docusaurus',
              label: 'Twitter',
            },
          ],
          title: 'Community',
        },
        {
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              href: 'https://github.com/quadnix/octo',
              label: 'GitHub',
            },
          ],
          title: 'More',
        },
      ],
      style: 'dark',
    },
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      items: [
        {
          label: 'Tutorial',
          position: 'left',
          sidebarId: 'tutorialSidebar',
          type: 'docSidebar',
        },
        { label: 'Blog', position: 'left', to: '/blog' },
        {
          href: 'https://github.com/quadnix/octo',
          label: 'GitHub',
          position: 'right',
        },
      ],
      logo: {
        alt: 'My Site Logo',
        src: 'img/logo.svg',
      },
      title: getBrand(),
    },
    prism: {
      darkTheme: prismThemes.vsDark,
      theme: prismThemes.vsDark,
    },
  } satisfies Preset.ThemeConfig,

  themes: ['@docusaurus/theme-mermaid'],
  title: getBrand(BRAND_VARIATION.ORG_PROJ, BRAND_FORMAT.CAPITALIZE),
  // Set the production url of your site here
  url: 'https://your-docusaurus-site.example.com',
};

export default config;
