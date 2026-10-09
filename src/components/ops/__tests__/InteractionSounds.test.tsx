import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,waitFor,act,fireEvent} from '@testing-library/react'
import {InteractionSounds} from '../InteractionSounds'
const audio=vi.hoisted(()=>({unlock:vi.fn(),play:vi.fn(),stopAll:vi.fn(),destroy:vi.fn(),create:vi.fn()}))
vi.mock('uisfx',()=>({createUISFX:audio.create}))
beforeEach(()=>{
 vi.clearAllMocks()
 audio.unlock.mockResolvedValue(true);audio.destroy.mockResolvedValue(undefined)
 audio.create.mockReturnValue(audio)
})
afterEach(()=>vi.restoreAllMocks())
describe('Optional click sounds',()=>{
 it('does not create an audio player while muted',async()=>{
  render(<InteractionSounds enabled={false}/>)
  await act(async()=>{})
  expect(audio.create).not.toHaveBeenCalled()
 })
 it('requires a trusted click, ignores disabled controls and cleans up on mute',async()=>{
  const listeners=vi.spyOn(document,'addEventListener')
  const view=render(<><InteractionSounds enabled/><button>Marketplace</button><button disabled>Disabled</button><a href="/city">City</a></>)
  await waitFor(()=>expect(audio.create).toHaveBeenCalledOnce())
  const click=listeners.mock.calls.find(([name])=>name==='click')![1] as (event:MouseEvent)=>void
  fireEvent.click(screen.getByText('Marketplace'))
  expect(audio.unlock).not.toHaveBeenCalled()
  const trusted=(target:Element)=>({isTrusted:true,target} as unknown as MouseEvent)
  await act(async()=>click(trusted(screen.getByText('Disabled'))))
  expect(audio.unlock).not.toHaveBeenCalled()
  await act(async()=>click(trusted(screen.getByText('Marketplace'))))
  expect(audio.play).toHaveBeenCalledWith('press')
  await act(async()=>click(trusted(screen.getByText('City'))))
  expect(audio.play).toHaveBeenCalledWith('forward')
  view.rerender(<InteractionSounds enabled={false}/>)
  expect(audio.stopAll).toHaveBeenCalledOnce();expect(audio.destroy).toHaveBeenCalledOnce()
 })
 it('does not play a pending unlock after being muted',async()=>{
  let resolve!:(value:boolean)=>void
  audio.unlock.mockReturnValue(new Promise<boolean>(done=>{resolve=done}))
  const listeners=vi.spyOn(document,'addEventListener')
  const view=render(<><InteractionSounds enabled/><button>Open</button></>)
  await waitFor(()=>expect(audio.create).toHaveBeenCalledOnce())
  const click=listeners.mock.calls.find(([name])=>name==='click')![1] as (event:MouseEvent)=>void
  click({isTrusted:true,target:screen.getByText('Open')} as unknown as MouseEvent)
  view.rerender(<InteractionSounds enabled={false}/>)
  await act(async()=>resolve(true))
  expect(audio.play).not.toHaveBeenCalled()
 })
 it('reports blocked audio without interfering with the control action',async()=>{
  audio.unlock.mockResolvedValue(false)
  const listeners=vi.spyOn(document,'addEventListener')
  const action=vi.fn()
  render(<><InteractionSounds enabled/><button onClick={action}>Open</button></>)
  await waitFor(()=>expect(audio.create).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByText('Open'));expect(action).toHaveBeenCalledOnce()
  const click=listeners.mock.calls.find(([name])=>name==='click')![1] as (event:MouseEvent)=>void
  await act(async()=>click({isTrusted:true,target:screen.getByText('Open')} as unknown as MouseEvent))
  expect(screen.getByRole('status')).toHaveTextContent('Click sounds unavailable')
  expect(audio.play).not.toHaveBeenCalled()
 })
})
