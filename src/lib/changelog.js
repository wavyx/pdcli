import { collectPages } from './pagination.js'
import { ApiError } from './errors.js'

/** Token cost of one GET /deals/{id}/changelog request (rate-limit budget). */
export const CHANGELOG_COST = 20
/** Above this deal count, mining gets expensive — warn before proceeding. */
export const MINE_WARN_THRESHOLD = 100
/** Pipedrive caps list page sizes at 500; the changelog uses the same cap. */
const MAX_PAGE_LIMIT = 500

/**
 * Fetch a single deal's field-change history. The deal changelog lives on a v1
 * path but pages with a flat v2-style cursor (additional_data.next_cursor), so
 * the v2 pager works directly. Rows arrive newest-first (the API's native order)
 * and carry { field_key, old_value, new_value, actor_user_id, time, ... }.
 * @param {ReturnType<import('./client.js').createClient>} client
 * @param {number} dealId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function fetchChangelog(client, dealId, { limit } = {}) {
  return collectPages(
    client.pageV2(`/api/v1/deals/${dealId}/changelog`, {
      limit: limit ?? MAX_PAGE_LIMIT,
    }),
  )
}

/**
 * Mine the changelog of many deals, one request each. Warns on stderr before
 * mining a large set — each request costs tokens — then lets the client's rate
 * limiter pace it. A single bad changelog request must not abort the whole mine:
 * deals whose fetch throws an ApiError are skipped, counted, and reported once
 * after mining completes. Non-ApiError failures (e.g. socket hangups) rethrow.
 * @param {ReturnType<import('./client.js').createClient>} client
 * @param {object[]} deals deals to mine (id + current stage_id needed per deal)
 * @param {{ limit?: number, warnThreshold?: number, costPerRequest?: number }} [options]
 * @returns {Promise<{ dealId: number, stageId: number, rows: object[] }[]>}
 */
export async function mineMany(
  client,
  deals,
  {
    limit,
    warnThreshold = MINE_WARN_THRESHOLD,
    costPerRequest = CHANGELOG_COST,
  } = {},
) {
  if (deals.length > warnThreshold) {
    process.stderr.write(
      `Mining stage history for ${deals.length} deals ` +
        `(~${deals.length} requests, ${costPerRequest} tokens each); ` +
        `rate limiting may slow this down.\n`,
    )
  }

  const transitionsByDeal = []
  let skipped = 0
  for (const deal of deals) {
    try {
      const rows = await fetchChangelog(client, deal.id, { limit })
      transitionsByDeal.push({
        dealId: deal.id,
        stageId: deal.stage_id,
        rows,
      })
    } catch (err) {
      // One bad changelog request must not abort the whole mine: skip the
      // deal, count it, and warn once after mining completes.
      if (err instanceof ApiError) {
        skipped++
        continue
      }
      throw err
    }
  }

  if (skipped > 0) {
    process.stderr.write(
      `skipped ${skipped} deal(s) whose changelog could not be fetched\n`,
    )
  }

  return transitionsByDeal
}
