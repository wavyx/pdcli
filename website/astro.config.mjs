// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import remarkGfm from 'remark-gfm';
import { unified } from '@astrojs/markdown-remark';

// pdcli — Astro + Starlight config for GitHub Pages (project site)
// Live URL: https://wavyx.github.io/pdcli
export default defineConfig({
  site: 'https://wavyx.github.io',
  base: '/pdcli',

  // GFM tables in .mdx; smartypants off so code examples keep literal
  // `--flags` and straight quotes.
  markdown: { processor: unified({ smartypants: false, remarkPlugins: [remarkGfm] }) },

  integrations: [
    starlight({
      title: 'pdcli',
      description:
        'A fast, scriptable CLI for Pipedrive — terminals, CI, and AI agents.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/wavyx/pdcli',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/wavyx/pdcli/edit/main/website/',
      },
      plugins: [
        // /llms.txt, /llms-full.txt, /llms-small.txt for AI agents
        starlightLlmsTxt(),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Installation', slug: 'start/installation' },
            { label: 'Quickstart', slug: 'start/quickstart' },
            { label: 'Quickstart for AI agents', slug: 'start/agents' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Authentication', slug: 'guides/authentication' },
            { label: 'Profiles & configuration', slug: 'guides/configuration' },
            { label: 'Custom fields', slug: 'guides/custom-fields' },
            { label: 'Bulk operations & CSV import', slug: 'guides/bulk' },
            { label: 'Full-account backup', slug: 'guides/backup' },
            { label: 'Sales analytics', slug: 'guides/analytics' },
            { label: 'Data-hygiene audit', slug: 'guides/audit' },
            { label: 'The raw api escape hatch', slug: 'guides/api' },
          ],
        },
        {
          label: 'Automation',
          items: [
            { label: 'Output & filtering', slug: 'automation/output' },
            { label: 'Exit codes', slug: 'automation/exit-codes' },
            { label: 'CI recipes', slug: 'automation/ci' },
            { label: 'Cookbook', slug: 'automation/cookbook' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'How pdcli talks to Pipedrive', slug: 'concepts/api-model' },
            { label: 'Security model', slug: 'concepts/security' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Commands', slug: 'reference/commands' },
            { label: 'Config & environment', slug: 'reference/config' },
            { label: 'Troubleshooting', slug: 'reference/troubleshooting' },
            {
              label: 'Changelog (GitHub)',
              link: 'https://github.com/wavyx/pdcli/releases',
            },
          ],
        },
      ],
    }),
  ],
});
