import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CircularMeter } from '../CircularMeter'

describe('CircularMeter', () => {
  it('renders the rounded percentage as center text', () => {
    render(<CircularMeter value={42.6} label="DONE" color="#22d3ee" />)
    expect(screen.getByText('43')).toBeInTheDocument()
  })

  it('clamps values above 100', () => {
    render(<CircularMeter value={150} label="DONE" color="#22d3ee" />)
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('clamps negative values to 0', () => {
    render(<CircularMeter value={-10} label="DONE" color="#22d3ee" />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
