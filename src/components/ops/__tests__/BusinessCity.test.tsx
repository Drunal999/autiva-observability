import {describe,it,expect,vi,beforeEach} from 'vitest'
import {render,screen,fireEvent,within} from '@testing-library/react'
import useSWR from 'swr'
import {BusinessCityView} from '../BusinessCityView'
import {OpsShell} from '../OpsShell'
import {moduleStatus,buildingFor,type CityModule} from '@/lib/ops/cityMarketplace'
const renderCounts=vi.hoisted(()=>({automations:0}))
vi.mock('../HomeBento',async importOriginal=>{
 const actual=await importOriginal<typeof import('../HomeBento')>()
 return {...actual,Automations:(props:Parameters<typeof actual.Automations>[0])=>{renderCounts.automations++;return <actual.Automations {...props}/>}}
})
vi.mock('swr',()=>({default:vi.fn()}))
vi.mock('next/navigation',()=>({usePathname:()=>'/city'}))
vi.mock('@/lib/realtime/client',()=>({useEventListener:vi.fn()}))
vi.mock('../AutivaAssistant',()=>({AutivaAssistant:()=>null}))
vi.mock('../FactBubble',()=>({FactBubble:()=>null}))
vi.mock('../Presence',()=>({usePresence:()=>[],PresenceBar:()=>null}))
const automation:CityModule={id:'m1',key:'lead-followup',displayName:'Lead Follow-up',district:'sales',pendingApprovals:0,agents:[{id:'a1',status:'IDLE'}],runs:[]}
// The home bento also lists automations; marketplace assertions look inside the marketplace only.
const catalog=()=>within(screen.getByRole('region',{name:'Building automations'}))
const stub=(data:unknown,error?:Error)=>vi.mocked(useSWR).mockReturnValue({data,error,mutate:vi.fn(),isValidating:false,isLoading:false} as ReturnType<typeof useSWR>)
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});localStorage.clear();stub({districts:[automation],sample:true})})
describe('Business city',()=>{
 it('pauses before opening Marketplace and avoids rendering Home widgets again on building clicks',()=>{
  render(<BusinessCityView/>)
  const count=renderCounts.automations
  const pause=vi.fn(()=>expect(screen.queryByRole('dialog',{name:'Marketplace'})).not.toBeInTheDocument())
  window.addEventListener('autiva:city-pause',pause,{once:true})
  fireEvent.click(screen.getByRole('button',{name:'Marketplace'}))
  expect(pause).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'Marketing'}))
  fireEvent.click(screen.getByRole('button',{name:'Sales & Leads'}))
  expect(catalog().getByText('Lead Follow-up')).toBeInTheDocument()
  expect(renderCounts.automations).toBe(count)
 })

 it('loads the city only on request on a phone and keeps building navigation available',()=>{
  vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList)
  render(<BusinessCityView/>)
  expect(screen.queryByTitle('Your business city: tap a building to open its marketplace')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:/Enter your city/}))
  expect(screen.getByTitle('Your business city: tap a building to open its marketplace')).toBeInTheDocument()
  const districts=within(screen.getByRole('navigation',{name:'City districts'}))
  fireEvent.click(districts.getByRole('button',{name:'Sales & Leads'}))
  expect(screen.queryByRole('navigation',{name:'City districts'})).not.toBeInTheDocument()
  expect(screen.queryByTitle('Your business city: tap a building to open its marketplace')).not.toBeInTheDocument()
  expect(screen.getByRole('dialog',{name:'Marketplace'})).toBeInTheDocument()
  fireEvent.keyDown(window,{key:'Escape'})
  expect(screen.queryByRole('dialog',{name:'Marketplace'})).not.toBeInTheDocument()
 })

 it('keeps unknown categories visible and never invents paused or available status',()=>{
  expect(buildingFor('new-department')).toBe('operations')
  expect(moduleStatus(automation)).toBe('Not running')
  expect(moduleStatus({...automation,agents:[]})).toBe('Status not reported')
  expect(moduleStatus({...automation,pendingApprovals:1})).toBe('Needs attention')
 })
 it('enters buildings from the category list and labels future collections',()=>{
  render(<BusinessCityView/>);fireEvent.click(screen.getByRole('button',{name:'Marketplace'}));expect(catalog().getByText('Lead Follow-up')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Legal & Compliance'}))
  expect(catalog().getByRole('heading',{name:'Notice Reader'})).toBeInTheDocument()
  expect(catalog().getByRole('region',{name:'CA Firm Suite'})).toBeInTheDocument()
  expect(catalog().getAllByText('Planned').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button',{name:'Security'}))
  expect(screen.getByRole('heading',{name:'Coming soon'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:/Clinics.*Coming soon/}))
  expect(screen.getByRole('heading',{name:'Clinics'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/install|buy/i})).not.toBeInTheDocument()
 })
 it('shows the shop window, labels the AI video, and opens the advertised workflow',async()=>{
  render(<BusinessCityView/>);fireEvent.click(screen.getByRole('button',{name:'Marketplace'}))
  expect(screen.getByRole('heading',{name:'Your phone, answered'})).toBeInTheDocument()
  expect(screen.getByText('AI-generated video')).toBeInTheDocument()
  expect(screen.getByText(/Coming soon · Customer Support/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'See how it works'}))
  expect(catalog().getByRole('heading',{name:'Customer Support'})).toBeInTheDocument()
  expect(await screen.findByText('Blueprint',{},{timeout:3000})).toBeInTheDocument()
 })
 it('searches across buildings and exposes actual records without inventing connections',()=>{
  render(<BusinessCityView/>);fireEvent.click(screen.getByRole('button',{name:'Marketplace'}));fireEvent.click(screen.getByRole('button',{name:'Marketing'}))
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Lead'}})
  expect(catalog().getByText('Lead Follow-up')).toBeInTheDocument()
  // No connection requirement is claimed for an automation whose catalog entry does not document one.
  expect(screen.queryByText(/connection/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'View activity'}))
  expect(screen.getByRole('heading',{name:'Agent desks'})).toBeInTheDocument()
  expect(screen.getByText('No current step reported.')).toBeInTheDocument()
  expect(screen.getByText('Idle')).toBeInTheDocument()
  expect(screen.getByText(/does not mean it has never run/)).toBeInTheDocument()
 })
 it('does not present stale data or zero as healthy after a request fails',()=>{
  stub({districts:[automation],sample:true},new Error('offline'));render(<BusinessCityView/>)
  // Home: the count is unknown, not zero.
  expect(screen.getByText('Activity unavailable')).toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'Marketplace'}))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText('Lead Follow-up')).not.toBeInTheDocument()
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
