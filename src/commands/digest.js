import { Flags } from '@oclif/core'
import { writeFile } from 'node:fs/promises'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { parsePeriod, formatApiDatetime } from '../lib/period.js'
import { resolvePipelineWithName } from '../lib/pipelines.js'
import { fetchRevenueGoal } from '../lib/goals.js'
import { mineMany } from '../lib/changelog.js'
import { assembleDigest, digestToReport } from '../lib/digest.js'
import { formatMarkdownReport, formatHtmlReport } from '../lib/output/report.js'
import { CliError } from '../lib/errors.js'

export default class DigestCommand extends BaseCommand {
  static description =
    'Monday packet: one pipeline-scoped fetch fanned into velocity, health, ' +
    'coverage, funnel, forecast and hygiene. --deep adds changelog-mined ' +
    'aging/slippage/stage-skips; --format md|html (+ --out) writes a shareable ' +
    'artifact for cron → Slack/email.'

  static examples = [
    '<%= config.bin %> digest',
    '<%= config.bin %> digest --pipeline 1 --output json',
    '<%= config.bin %> digest --deep',
    '<%= config.bin %> digest --format md --out monday.md',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
    period: Flags.string({
      description: 'Trailing window for closed deals / the goal (Nd or Nm)',
      default: '90d',
    }),
    target: Flags.integer({
      description: 'Manual revenue quota override (skips the Goals API)',
    }),
    'commit-threshold': Flags.integer({
      description: 'Min effective win-probability (%) counted toward commit',
      default: 70,
    }),
    deep: Flags.boolean({
      description:
        'Mine each deal’s changelog to add aging/slippage/stage-skips ' +
        '(one request per deal; warns over 100)',
      default: false,
    }),
    format: Flags.string({
      description: 'Render the packet as a shareable artifact',
      options: ['md', 'html'],
    }),
    out: Flags.string({
      description: 'Write the --format artifact to this file instead of stdout',
    }),
  }

  async run() {
    const { flags } = await this.parse(DigestCommand)
    const now = new Date()
    const since = parsePeriod(flags.period, now)

    if (flags.out && !flags.format) {
      throw new CliError('--out requires --format md|html', { exitCode: 64 })
    }

    const { id: pipelineId, name: pipelineName } =
      await resolvePipelineWithName(this.apiClient, flags.pipeline)

    const base = { pipeline_id: pipelineId, limit: 500 }
    const updatedSince = formatApiDatetime(since)
    const [stages, open, won, lost, activities] = await Promise.all([
      collectPages(
        this.apiClient.pageV2('/api/v2/stages', {
          pipeline_id: pipelineId,
          limit: 500,
        }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', { ...base, status: 'open' }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', {
          ...base,
          status: 'won',
          updated_since: updatedSince,
        }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', {
          ...base,
          status: 'lost',
          updated_since: updatedSince,
        }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/activities', {
          done: false,
          limit: 500,
        }),
      ),
    ])

    // Quota: --target wins; otherwise try the revenue goal but tolerate "no
    // goal configured" (a usage error from the Goals helper) by dropping the
    // coverage section rather than failing the whole digest.
    let goal = null
    if (flags.target != null) {
      goal = { goalTarget: flags.target, progress: 0 }
    } else {
      try {
        goal = await fetchRevenueGoal(this.apiClient, {
          period: flags.period,
          now,
        })
      } catch (err) {
        // fetchRevenueGoal raises CliError(64) for "no goal"/multi-currency;
        // anything else (auth, 5xx) is real and must propagate.
        if (err.exitCode !== 64) throw err
        process.stderr.write(`Note: skipping coverage — ${err.message}\n`)
      }
    }

    // Deep: mine each deal's changelog ONCE over the union, then fan out.
    const transitionsByDeal = flags.deep
      ? await mineMany(this.apiClient, [...open, ...won, ...lost])
      : []

    const packet = assembleDigest(
      { stages, open, won, lost, activities, transitionsByDeal, goal },
      {
        now,
        since,
        pipeline: { id: pipelineId, name: pipelineName },
        period: flags.period,
        commitThreshold: flags['commit-threshold'],
        deep: flags.deep,
      },
    )

    if (flags.format) {
      const report = digestToReport(packet, { generatedAt: now.toISOString() })
      const rendered =
        flags.format === 'md'
          ? formatMarkdownReport(report)
          : formatHtmlReport(report)
      if (flags.out) {
        await writeFile(flags.out, `${rendered}\n`, 'utf8')
        this.log(`Wrote ${flags.format} digest to ${flags.out}`)
      } else {
        this.log(rendered)
      }
      return
    }

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(packet, {})
      return
    }

    this.#renderTable(
      digestToReport(packet, { generatedAt: now.toISOString() }),
    )
  }

  /** Render the report object as labeled terminal sections. */
  #renderTable(report) {
    this.log(report.title)
    for (const m of report.meta) this.log(`  ${m.label}: ${m.value}`)

    for (const section of report.sections) {
      this.log('')
      this.log(`▸ ${section.heading}`)
      if (section.type === 'kv') {
        for (const p of section.pairs) this.log(`  ${p.label}: ${p.value}`)
      } else if (section.type === 'lines') {
        for (const line of section.lines) this.log(`  ${line}`)
      } else {
        this.#renderSectionTable(section)
      }
    }
  }

  /** Render a table section via outputResults (honors the table renderer). */
  async #renderSectionTable(section) {
    const columns = {}
    for (const col of section.columns) columns[col.key] = { header: col.header }
    await this.outputResults(section.rows, columns)
  }
}
