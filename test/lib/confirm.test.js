import { describe, it, expect, vi } from 'vitest'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

const { confirm: mockConfirm } = await import('@inquirer/prompts')
const { confirmAction } = await import('../../src/lib/confirm.js')

describe('confirmAction', () => {
  it('returns true when skipConfirm is true', async () => {
    const result = await confirmAction('Delete?', true)
    expect(result).toBe(true)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('prompts user when skipConfirm is false', async () => {
    mockConfirm.mockResolvedValue(true)
    const result = await confirmAction('Delete?', false)
    expect(result).toBe(true)
    expect(mockConfirm).toHaveBeenCalledWith({ message: 'Delete?' })
  })

  it('returns false when user declines', async () => {
    mockConfirm.mockResolvedValue(false)
    const result = await confirmAction('Delete?', false)
    expect(result).toBe(false)
  })

  it('passes a default of false to the prompt when requested', async () => {
    mockConfirm.mockResolvedValue(false)
    await confirmAction('Merge?', false, { default: false })
    expect(mockConfirm).toHaveBeenCalledWith({
      message: 'Merge?',
      default: false,
    })
  })

  it('treats a force-closed prompt (non-interactive stdin) as a "no"', async () => {
    const err = new Error('User force closed the prompt with 13 null')
    err.name = 'ExitPromptError'
    mockConfirm.mockRejectedValueOnce(err)
    await expect(confirmAction('sure?', false)).resolves.toBe(false)
  })

  it('rethrows non-prompt errors from inquirer', async () => {
    mockConfirm.mockRejectedValueOnce(new TypeError('boom'))
    await expect(confirmAction('sure?', false)).rejects.toThrow('boom')
  })
})
