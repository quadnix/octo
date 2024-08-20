import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  docsSidebar: [
    {
      label: 'Introduction',
      id: 'introduction',
      type: 'doc',
    },
    {
      label: 'Philosophy',
      id: 'philosophy',
      type: 'doc',
    },
    {
      label: 'Getting Started',
      link: {
        description: 'Installation & Setup.',
        type: 'generated-index',
      },
      items: [
        {
          label: 'Installation',
          id: 'getting-started/installation',
          type: 'doc',
        },
        {
          label: 'Hello World!',
          id: 'getting-started/hello-world',
          type: 'doc',
        },
        {
          label: 'Project Structure',
          id: 'getting-started/project-structure',
          type: 'doc',
        },
      ],
      type: 'category',
    },
    {
      label: 'Fundamentals',
      link: {
        description: 'Basic concepts.',
        type: 'generated-index',
      },
      items: [
        {
          label: 'Models',
          id: 'fundamentals/models',
          type: 'doc',
        },
        {
          label: 'AWS Models',
          id: 'fundamentals/aws-models',
          type: 'doc',
        },
        {
          label: 'Resources',
          id: 'fundamentals/resources',
          type: 'doc',
        },
        {
          label: 'The Big Picture, Part I',
          id: 'fundamentals/the-big-picture-part-one',
          type: 'doc',
        },
        {
          label: 'Dependencies',
          id: 'fundamentals/dependencies',
          type: 'doc',
        },
        {
          label: 'Modules',
          id: 'fundamentals/modules',
          type: 'doc',
        },
        {
          label: 'The Big Picture, Part II',
          id: 'fundamentals/the-big-picture-part-two',
          type: 'doc',
        },
        {
          label: 'Actions',
          id: 'fundamentals/actions',
          type: 'doc',
        },
        {
          label: 'Overlay & Anchor',
          id: 'fundamentals/overlay-and-anchor/index',
          type: 'doc',
        },
      ],
      type: 'category',
    },
    {
      label: 'Techniques',
      link: {
        description: 'Techniques and run books.',
        type: 'generated-index',
      },
      items: [
        {
          label: 'Testing',
          id: 'techniques/testing',
          type: 'doc',
        },
      ],
      type: 'category',
    },
  ],
};

export default sidebars;
