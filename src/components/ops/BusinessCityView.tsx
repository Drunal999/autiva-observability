'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import {BUILDINGS,INDUSTRIES,buildingFor,moduleStatus,moduleDetails,type BuildingId,type MarketplaceData} from '@/lib/ops/cityMarketplace'
import {useEventListener} from '@/lib/realtime/client'
import {CITY_FOCUS_EVENT,takeCityFocus} from '@/lib/ops/cityFocus'
import {useWorkspaceMode} from './OpsShell'
import {CategoryCity} from './CategoryCity'
import styles from './BusinessCity.module.css'
const LegacyCity=dynamic(()=>import('./ImmersiveCityView').then(m=>m.ImmersiveCityView),{loading:()=> <p className="p-6">Loading 3D city…</p>})
const fetcher=async(url:string)=>{const response=await fetch(url);if(!response.ok)throw new Error('Could not load your workspace activity.');return response.json()}
export function BusinessCityView(){
 const {data,error,mutate,isValidating}=useSWR<MarketplaceData>('/api/city',fetcher,{refreshInterval:15000})
 useEventListener(()=>void mutate(),['RUNS','FLEET','APPROVALS'])
 const mode=useWorkspaceMode()
 const [selected,setSelected]=useState<BuildingId>('sales')
 const [query,setQuery]=useState('')
 const [industry,setIndustry]=useState<string|null>(null)
 const [expanded,setExpanded]=useState<string|null>(null)
 const [legacy,setLegacy]=useState(false)
 const [clock,setClock]=useState<{label:string;night:boolean}|null>(null)
 const [requestedModule,setRequestedModule]=useState<string|null>(null)
 const details=useRef<HTMLElement>(null)
 useEffect(()=>{const tick=()=>{const date=new Date();setClock({label:new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date),night:date.getHours()<6||date.getHours()>=19})};tick();const timer=setInterval(tick,60000);return()=>clearInterval(timer)},[])
 useEffect(()=>{setRequestedModule(takeCityFocus());const focus=(e:Event)=>{takeCityFocus();setRequestedModule((e as CustomEvent<string>).detail)};window.addEventListener(CITY_FOCUS_EVENT,focus);return()=>window.removeEventListener(CITY_FOCUS_EVENT,focus)},[])
 useEffect(()=>{if(!requestedModule||!data||error)return;const automation=data.districts.find(m=>m.id===requestedModule);if(automation){setSelected(buildingFor(automation.district));setExpanded(automation.id);setIndustry(null);setQuery('');setLegacy(false);setRequestedModule(null)}},[requestedModule,data,error])
 const modules=error?[]:data?.districts??[]
 const selectedBuilding=BUILDINGS.find(b=>b.id===selected)!
 const visible=modules.filter(m=>query?`${m.displayName} ${moduleDetails(m).purpose}`.toLowerCase().includes(query.toLowerCase()):buildingFor(m.district)===selected)
 const attention=modules.filter(m=>moduleStatus(m)==='Needs attention').length
 const running=modules.filter(m=>moduleStatus(m)==='Running').length
 const enter=()=>requestAnimationFrame(()=>{details.current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});details.current?.focus({preventScroll:true})})
 const choose=(id:BuildingId)=>{setSelected(id);setQuery('');setIndustry(null);setExpanded(null);enter()}
 if(legacy)return <><div className={styles.returnBar}><button onClick={()=>setLegacy(false)}>Back to your business city</button><span>Original 3D view</span></div><LegacyCity/></>
 return <section className={styles.workspace}>
  <header className={styles.hero}>
   <div className={styles.intro}><div><p className={styles.welcome}>A little clarity for your day</p><h1>Your business. All together.</h1><p>Choose a building to see what’s working, what needs you, and what’s next.</p></div><Link className={styles.assistantLink} href="/brain">Talk to Bolo <span aria-hidden="true">↗</span></Link></div>
  </header>
  <div className={styles.overview} aria-label="Workspace summary">
    <div><span>Automations in this workspace</span><strong>{error||!data?'—':modules.length}</strong></div>
    <div><span>Running now</span><strong>{error||!data?'—':running}</strong></div>
    <div><span>Need attention</span><strong>{error||!data?'—':attention}</strong><Link href="/approvals">Review decisions</Link></div>
    <p>{error?'Activity is unavailable.':!data?'Connecting to your workspace…':data.sample?'Sample workspace · These are example records.':'Based on recorded workspace activity.'}</p>
  </div>
  <div className={styles.cityHeading}><div><h2>Explore your city</h2><p>Every building is a part of your business.</p></div><span>{clock?.label??'Local time'} <span aria-hidden="true">{clock?.night?'☾':'☀'}</span></span></div>
  <div className={styles.mapScroll}><CategoryCity selected={industry?null:selected} onSelect={choose} night={clock?.night??false} labels={Object.fromEntries(BUILDINGS.map(b=>{const group=modules.filter(m=>buildingFor(m.district)===b.id);return [b.id,error?'Activity unavailable':!data?'Loading…':!group.length?'Coming soon':group.some(m=>moduleStatus(m)==='Needs attention')?'Needs attention':group.some(m=>moduleStatus(m)==='Running')?'Running':`${group.length} automation${group.length===1?'':'s'}`]}))}/></div>
  <div className={styles.mapFoot}><p>Buildings organise your automations. A building’s windows light up while one of its automations is running.</p><button onClick={()=>setLegacy(true)}>Explore original 3D view</button></div>
  <div className={styles.mobileBuildings} role="group" aria-label="Choose a building">{BUILDINGS.map(b=><button key={b.id} onClick={()=>choose(b.id)} aria-pressed={!industry&&selected===b.id}>{b.name}</button>)}</div>
  <section className={styles.industries} aria-label="Industry districts"><div><h3>Built around your business</h3><p>Industry collections are coming soon.</p></div><div>{INDUSTRIES.map(name=><button key={name} aria-pressed={industry===name} onClick={()=>{setIndustry(name);setQuery('');enter()}}>{name}<span>Coming soon</span></button>)}</div></section>
  <section ref={details} tabIndex={-1} className={styles.catalog} aria-label="Building automations">
    <div className={styles.catalogHeader}><div><p className={styles.eyebrow}>{industry?'Industry district':query?'Your workspace':'Inside the building'}</p><h2>{industry??(query?'Search results':selectedBuilding.name)}</h2><p>{industry?`A planned collection for ${industry.toLowerCase()} businesses. No industry package is available to install yet.`:selectedBuilding.purpose}</p></div><label className={styles.search}><span>Find an automation</span><input type="search" placeholder="Search your workspace" value={query} onChange={e=>{setQuery(e.target.value);setIndustry(null)}}/></label></div>
    {industry?<div className={styles.empty}><h3>Coming soon</h3><p>You can explore business categories today. Industry-specific packages will appear here when they’re available.</p><button onClick={()=>choose('operations')}>Explore Operations</button></div>:error?<div role="alert" className={styles.empty}><h3>Your activity couldn’t be loaded</h3><p>No records have been changed. Try reconnecting to see your automations.</p><button disabled={isValidating} onClick={()=>void mutate()}>{isValidating?'Retrying…':'Try again'}</button></div>:!data?<div role="status" className={styles.empty}>Loading your automations…</div>:visible.length===0?<div className={styles.empty}><h3>{query?'No matching automations':'Coming soon'}</h3><p>{query?'Try another name or choose a building.':'There are no automations listed in this category for your workspace yet. Nothing is installed or activated by browsing.'}</p><button onClick={()=>{setQuery('');choose('operations')}}>Explore Operations</button></div>:<div className={styles.automationList}>{visible.map((automation,index)=>{
      const status=moduleStatus(automation),info=moduleDetails(automation),open=expanded===automation.id
      return <article key={automation.id} className={styles.automation}>
       <div className={styles.floor} data-lit={status==='Running'} aria-hidden="true"><span>F{visible.length-index}</span></div>
       <div className={styles.floorBody}>
       <div className={styles.automationTop}><div><h3>{automation.displayName}</h3><p>{info.purpose}</p></div><span className={styles.status} data-status={status}>{status}</span></div>
       <dl><div><dt>Who it’s for</dt><dd>{info.audience}</dd></div><div><dt>Connections needed</dt><dd>Not documented in this workspace yet.</dd></div></dl>
       <div className={styles.automationActions}>{automation.pendingApprovals>0?<Link className={styles.primary} href="/approvals">Review {automation.pendingApprovals} decision{automation.pendingApprovals===1?'':'s'}</Link>:<button className={styles.primary} aria-expanded={open} aria-controls={`activity-${automation.id}`} onClick={()=>setExpanded(open?null:automation.id)}>{open?'Hide activity':'View activity'}</button>}{automation.pendingApprovals>0&&<button aria-expanded={open} aria-controls={`activity-${automation.id}`} onClick={()=>setExpanded(open?null:automation.id)}>{open?'Hide activity':'View activity'}</button>}<span>{data.sample?'Sample records':'Workspace records'}</span></div>
       {open&&<div id={`activity-${automation.id}`} className={styles.activity}><h4>Recent recorded activity</h4><p>Up to 12 recent records from the last 24 hours; not a lifetime total.</p>{automation.runs.length?automation.runs.map(run=><div key={run.id} className={styles.activityRow}><span>{({SUCCESS:'Completed',FAILED:'Failed',RUNNING:'In progress',AWAITING_APPROVAL:'Awaiting approval'} as Record<string,string>)[run.status]??'Status not reported'}</span><time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>{mode==='team'&&data.mode==='internal'&&<p>{run.summary??'No summary recorded.'}</p>}</div>):<p>No recent records returned. This does not mean it has never run.</p>}{mode==='team'&&data.mode==='internal'&&<Link href="/trace">Open detailed traces</Link>}</div>}
       </div>
      </article>
    })}</div>}
  </section>
  <footer className={styles.footer}><span>Explore freely. Actions that need your approval stay in your hands.</span><Link href="/calendar">Open your calendar</Link></footer>
 </section>
}
