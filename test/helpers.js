import { runCommand } from '@oclif/test'
import nock from 'nock'
import { vi } from 'vitest'

export const COMPANY_DOMAIN = 'acme'

export function apiBase(domain = COMPANY_DOMAIN) {
  return `https://${domain}.pipedrive.com`
}

export function mockApi(domain = COMPANY_DOMAIN) {
  return nock(apiBase(domain))
}

/**
 * Run an oclif command class and capture its console.log output.
 * Oclif Command.log ultimately calls console.log via @oclif/core ux.stdout.
 */
export async function runCmd(CmdClass, argv = []) {
  const lines = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.map(String).join(' '))
  })
  try {
    await CmdClass.run(argv)
  } catch {
    // swallow oclif exit/error throws
  }
  spy.mockRestore()
  return lines.join('\n')
}

export { runCommand }
