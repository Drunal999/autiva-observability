import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskDetailModal } from '../TaskDetailModal'

describe('TaskDetailModal', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('shows a validation error and does not submit when title is empty', async () => {
    const onSaved = vi.fn()
    render(<TaskDetailModal task={null} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POSTs a new task when title is provided', async () => {
    const onSaved = vi.fn()
    render(<TaskDetailModal task={null} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Ship it' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({ method: 'POST' })
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })
})
