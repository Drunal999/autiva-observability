import {describe,it,expect,vi,beforeEach} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import useSWR from 'swr'
import {BusinessCityView} from '../BusinessCityView'
import {OpsShell} from '../OpsShell'
import {moduleStatus,buildingFor,type CityModule} from '@/lib/ops/cityMarketplace'
vi.mock('swr',()=>({default:vi.fn()}))
vi.mock('next/navigation',()=>({usePathname:()=>'/city'}))
vi.mock('@/lib/realtime/client',()=>({useEventListener:vi.fn()}))
vi.mock('../AutivaAssistant',()=>({AutivaAssistant:()=>null}))
vi.mock('../FactBubble',()=>({FactBubble:()=>null}))
vi.mock('../Presence',()=>({usePresence:()=>[],PresenceBar:()=>null}))
const automation:CityModule={id:'m1',key:'lead-followup',displayName:'Lead Follow-up',district:'sales',pendingApprovals:0,agents:[{id:'a1',status:'IDLE'}],runs:[]}
const stub=(data:unknown,error?:Error)=>vi.mocked(useSWR).mockReturnValue({data,error,mutate:vi.fn(),isValidating:false,isLoading:false} as ReturnType<typeof useSWR>)
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();stub({districts:[automation],sample:true})})
describe('Business city',()=>{
 it('keeps unknown categories visible and never invents paused or available status',()=>{
  expect(buildingFor('new-department')).toBe('operations')
  expect(moduleStatus(automation)).toBe('Not running')
  expect(moduleStatus({...automation,agents:[]})).toBe('Status not reported')
  expect(moduleStatus({...automation,pendingApprovals:1})).toBe('Needs attention')
 })
 it('enters buildings by keyboard and labels future collections',()=>{
  render(<BusinessCityView/>);expect(screen.getByText('Lead Follow-up')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('button',{name:'Enter Legal & Compliance'}),{key:'Enter'})
  expect(screen.getByRole('heading',{name:'Coming soon'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:/Clinics.*Coming soon/}))
  expect(screen.getByRole('heading',{name:'Clinics'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/install|buy/i})).not.toBeInTheDocument()
 })
 it('searches across buildings and exposes actual records without inventing connections',()=>{
  render(<BusinessCityView/>);fireEvent.click(screen.getByRole('button',{name:'Enter Marketing'}))
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Lead'}})
  expect(screen.getByText('Lead Follow-up')).toBeInTheDocument()
  // No connection requirement is claimed for an automation whose catalog entry does not document one.
  expect(screen.queryByText(/connection/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'View activity'}))
  expect(screen.getByText(/does not mean it has never run/)).toBeInTheDocument()
 })
 it('does not present stale data or zero as healthy after a request fails',()=>{
  stub({districts:[automation],sample:true},new Error('offline'));render(<BusinessCityView/>)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText('Lead Follow-up')).not.toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(3)
 })
 it('starts simple and exposes all preserved engineering URLs in Team',()=>{
  stub(undefined);render(<OpsShell><p>Same data</p></OpsShell>)
  expect(screen.queryByRole('navigation',{name:'Team navigation'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Team'}))
  expect(screen.getByRole('link',{name:'Terminal'})).toHaveAttribute('href','/terminal')
  expect(screen.getByRole('link',{name:'Mission & board'})).toHaveAttribute('href','/board')
  expect(screen.getByRole('link',{name:'Automations'})).toHaveAttribute('href','/automations')
  fireEvent.click(screen.getByRole('button',{name:'Simple'}))
  expect(screen.queryByRole('navigation',{name:'Team navigation'})).not.toBeInTheDocument()
  expect(screen.getByText('Same data')).toBeInTheDocument()
 })
})
