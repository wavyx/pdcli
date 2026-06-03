import { describe, it, expect } from 'vitest'
import { groupByTopic, renderGithubMarkdown } from '../scripts/gen-commands.mjs'

const manifest = {
  version: '0.1.0',
  commands: {
    'deal:list': {
      id: 'deal:list',
      description: 'List deals',
      flags: {
        status: {
          type: 'option',
          options: ['open', 'won'],
          description: 'Filter by status',
        },
        output: {
          type: 'option',
          helpGroup: 'GLOBAL',
          description: 'Output format',
        },
      },
      args: {},
      examples: ['<%= config.bin %> deal list'],
    },
    'deal:get': {
      id: 'deal:get',
      description: 'Get a deal by ID',
      flags: {},
      args: { id: { required: true } },
      examples: [],
    },
    search: {
      id: 'search',
      description: 'Global search',
      flags: {},
      args: { term: { required: true } },
      examples: [],
    },
    hidden: { id: 'secret', hidden: true, flags: {}, args: {} },
  },
}

describe('groupByTopic', () => {
  it('groups commands by topic and filters hidden ones', () => {
    const { commands, byTopic } = groupByTopic(manifest)
    expect(commands).toHaveLength(3)
    expect(Object.keys(byTopic).sort()).toEqual(['_root', 'deal'])
    expect(byTopic.deal).toHaveLength(2)
  })
})

describe('renderGithubMarkdown', () => {
  it('renders sections per topic with usage, flags, and examples', () => {
    const md = renderGithubMarkdown(manifest, 'pdcli')

    expect(md).toContain('AUTO-GENERATED')
    expect(md).toContain('### `pdcli deal list`')
    expect(md).toContain('pdcli deal get <id> [flags]')
    expect(md).toContain('`--status <open|won>`')
    // global flags excluded from per-command flag lists
    expect(md).not.toContain('`--output <value>`')
    expect(md).toContain('pdcli deal list\n')
    // hidden commands excluded
    expect(md).not.toContain('secret')
  })
})
