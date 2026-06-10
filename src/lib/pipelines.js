import { CliError } from './errors.js'

/**
 * Resolve the pipeline a pipeline-scoped command should operate on: the
 * explicit flag value when given, else the account's only pipeline. Several
 * pipelines without a flag is a usage error (exit 64) listing the choices.
 * Returns undefined when the account has no pipelines at all.
 *
 * Extracted from the seven commands that each inlined the identical block
 * (coverage/aging/slippage/conversion-matrix/funnel/health/stage-skips) so the
 * >1-pipeline guard lives in one tested place.
 *
 * @param {{ get: (path: string) => Promise<{ data?: object[] }> }} client
 * @param {number | undefined | null} flagPipeline
 * @returns {Promise<number | undefined>}
 */
export async function resolvePipeline(client, flagPipeline) {
  if (flagPipeline != null) return flagPipeline

  const body = await client.get('/api/v2/pipelines')
  const pipelines = body.data ?? []
  if (pipelines.length > 1) {
    throw new CliError(
      `Account has ${pipelines.length} pipelines — pass --pipeline <id> ` +
        `(${pipelines.map((p) => `${p.id}=${p.name}`).join(', ')})`,
      { exitCode: 64 },
    )
  }
  return pipelines[0]?.id
}
