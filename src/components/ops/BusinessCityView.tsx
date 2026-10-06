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
import {useBrainStatus} from '@/lib/ops/brain'
import styles from './BusinessCity.module.css'
const LegacyCity=dynamic(()=>import('./ImmersiveCityView').then(m=>m.ImmersiveCityView),{loading:()=> <p className="p-6">Loading 3D city…</p>})
const greeting=(hour:number)=>hour<5?'Working late':hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'
const Icon=({d}:{d:string})=><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>
/** The iOS month widget: Sunday-first grid, red reserved for the month name and today. */
function MonthWidget({at}:{at:number}){
 const now=new Date(at),y=now.getFullYear(),m=now.getMonth(),today=now.getDate()
 const cells=[...Array(new Date(y,m,1).getDay()).fill(null),...Array.from({length:new Date(y,m+1,0).getDate()},(_,i)=>i+1)]
 return <Link href="/calendar" className={`liquid-glass ${styles.widget}`} aria-label={`Open calendar. Today is ${now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})}`}>
  <p className={styles.month}>{now.toLocaleDateString(undefined,{month:'long'}).toUpperCase()}</p>
  <div className={styles.days} aria-hidden="true">{['S','M','T','W','T','F','S'].map((d,i)=><span key={`d${i}`} className={styles.dow}>{d}</span>)}{cells.map((d,i)=><span key={i} data-today={d===today}>{d??''}</span>)}</div>
 </Link>
}
const fetcher=async(url:string)=>{const response=await fetch(url);if(!response.ok)throw new Error('Could not load your workspace activity.');return response.json()}
export function BusinessCityView(){
 const {data,error,mutate,isValidating}=useSWR<MarketplaceData>('/api/city',fetcher,{refreshInterval:15000})
 useEventListener(()=>void mutate(),['RUNS','FLEET','APPROVALS'])
 const mode=useWorkspaceMode()
 const brain=useBrainStatus()
 const [selected,setSelected]=useState<BuildingId>('sales')
 const [query,setQuery]=useState('')
 const [industry,setIndustry]=useState<string|null>(null)
 const [expanded,setExpanded]=useState<string|null>(null)
 const [legacy,setLegacy]=useState(false)
 const [clock,setClock]=useState<{label:string;night:boolean;hour:number;day:string;at:number}|null>(null)
 const [requestedModule,setRequestedModule]=useState<string|null>(null)
 const details=useRef<HTMLElement>(null)
 useEffect(()=>{const tick=()=>{const date=new Date();setClock({label:new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date),night:date.getHours()<6||date.getHours()>=19,hour:date.getHours(),day:new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(date),at:date.getTime()})};tick();const timer=setInterval(tick,60000);return()=>clearInterval(timer)},[])
 useEffect(()=>{setRequestedModule(takeCityFocus());const focus=(e:Event)=>{takeCityFocus();setRequestedModule((e as CustomEvent<string>).detail)};window.addEventListener(CITY_FOCUS_EVENT,focus);return()=>window.removeEventListener(CITY_FOCUS_EVENT,focus)},[])
 useEffect(()=>{if(!requestedModule||!data||error)return;const automation=data.districts.find(m=>m.id===requestedModule);if(automation){setSelected(buildingFor(automation.district));setExpanded(automation.id);setIndustry(null);setQuery('');setLegacy(false);setRequestedModule(null)}},[requestedModule,data,error])
 const modules=error?[]:data?.districts??[]
 const selectedBuilding=BUILDINGS.find(b=>b.id===selected)!
 const visible=modules.filter(m=>query?`${m.displayName} ${moduleDetails(m).purpose}`.toLowerCase().includes(query.toLowerCase()):buildingFor(m.district)===selected)
 const attention=modules.filter(m=>moduleStatus(m)==='Needs attention').length
 const running=modules.filter(m=>moduleStatus(m)==='Running').length
 const enter=()=>requestAnimationFrame(()=>{details.current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});details.current?.focus({preventScroll:true})})
 const choose=(id:BuildingId)=>{setSelected(id);setQuery('');setIndustry(null);setExpanded(null);enter()}
 if(legacy)return <><div className={`liquid-glass ${styles.returnBar}`}><button onClick={()=>setLegacy(false)}>Back to your business city</button><span>Original 3D view</span></div><LegacyCity/></>
 return <section className={styles.workspace}>
  {/* City hero: the 3D city fills the stage and the widgets float over its corners in glass,
      leaving the middle open so the city shows and its buildings stay clickable. */}
  <section className={styles.stage} aria-label="Workspace summary">
   <div className={styles.stageCity}><CategoryCity hero selected={industry?null:selected} onSelect={choose} night={clock?.night??false} labels={Object.fromEntries(BUILDINGS.map(b=>{const group=modules.filter(m=>buildingFor(m.district)===b.id);return [b.id,error?'Activity unavailable':!data?'Loading…':!group.length?'Coming soon':group.some(m=>moduleStatus(m)==='Needs attention')?'Needs attention':group.some(m=>moduleStatus(m)==='Running')?'Running':`${group.length} automation${group.length===1?'':'s'}`]}))}/></div>
   <header className={`${styles.top} ${styles.aGreet}`}><p className={styles.date}>{clock?.day??'\u00a0'}</p><h1>{clock?greeting(clock.hour):'Welcome back'}</h1></header>
   <section className={`liquid-glass ${styles.widget} ${styles.aBolo}`} aria-label="Bolo">
    <Link href="/brain" className={styles.ask}><span className={styles.orb} aria-hidden="true"/>Ask Bolo anything</Link>
    <div className={styles.quick}>
     <Link href="/brain" aria-label="Talk to Bolo"><Icon d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></Link>
     <Link href="/approvals" aria-label="Decisions"><Icon d="M5 12.5l4.5 4.5L19 7.5"/></Link>
     <Link href="/calendar" aria-label="Calendar"><Icon d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4"/></Link>
     <Link href="/chat" aria-label="Messages"><Icon d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/></Link>
    </div>
   </section>
   <section className={`liquid-glass ${styles.widget} ${styles.aNow}`} aria-label="Right now">
    <p className={styles.kicker}>Right now</p>
    <p className={styles.liveNum}>{error||!data?'—':running}</p>
    <p className={styles.liveText}>{error?'Activity unavailable':!data?'Connecting to your city…':running===0?'Your city is quiet':running===1?'automation working for you':'automations working for you'}</p>
    <p className={styles.note}>{error?'No records were changed.':!data?'':data.sample?'Sample workspace · These are example records.':'Based on recorded workspace activity.'}</p>
   </section>
   {/* Brain: the shared memory every agent reads. Its state is checked, never assumed. */}
   <Link href="/brain" className={`liquid-glass ${styles.widget} ${styles.aBrain}`} aria-label={`Brain, shared memory: ${brain==='online'?'online':brain==='offline'?'offline':brain==='remote'?'only on your own machine':'checking'}`}>
    <p className={styles.kicker}>Brain</p>
    <div className={styles.brainRow}>
     <span className={styles.brainMark} aria-hidden="true"><Icon d="M9.5 4A2.5 2.5 0 0 0 7 6.5 3 3 0 0 0 4.5 11a3 3 0 0 0 1 5A3 3 0 0 0 9.5 20 1.5 1.5 0 0 0 11 18.5v-13A1.5 1.5 0 0 0 9.5 4zM14.5 4A2.5 2.5 0 0 1 17 6.5a3 3 0 0 1 2.5 4.5 3 3 0 0 1-1 5 3 3 0 0 1-4 4 1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 14.5 4z"/></span>
     <div><p className={styles.statLabel}>Shared memory</p><p className={styles.brainState} data-state={brain??'checking'}>{brain==='online'?'Online':brain==='offline'?'Not running':brain==='remote'?'On your own machine only':'Checking…'}</p></div>
    </div>
   </Link>
   <Link href="/approvals" className={`liquid-glass ${styles.widget} ${styles.aNeeds}`} aria-label={`Needs you: ${error||!data?'unknown':attention}`}>
    <p className={styles.kicker}>Needs you</p>
    <p className={styles.stat} data-alert={!error&&!!data&&attention>0}>{error||!data?'—':attention}</p>
    <p className={styles.statLabel}>{!error&&data&&attention>0?'Review decisions':'Nothing waiting'}</p>
   </Link>
   <section className={`liquid-glass ${styles.widget} ${styles.aAuto}`} aria-label="Automations">
    <p className={styles.kicker}>Automations</p>
    <p className={styles.stat}>{error||!data?'—':modules.length}</p>
    <p className={styles.statLabel}>in your workspace</p>
   </section>
   <div className={styles.aCal}>{clock?<MonthWidget at={clock.at}/>:null}</div>
  </section>
  <div className={styles.mapFoot}><p>Tap a building to see what’s inside. Glowing windows mean something is running right now.</p>{mode==='team'&&<button onClick={()=>setLegacy(true)}>Explore original 3D view</button>}</div>
  <div className={styles.mobileBuildings} role="group" aria-label="Choose a building">{BUILDINGS.map(b=><button key={b.id} onClick={()=>choose(b.id)} aria-pressed={!industry&&selected===b.id}>{b.name}</button>)}</div>
  <section className={`liquid-glass ${styles.industries}`} aria-label="Industry districts"><div><h3>Made for your industry</h3><p>Ready-made packs for your kind of business are coming soon.</p></div><div>{INDUSTRIES.map(name=><button key={name} aria-pressed={industry===name} onClick={()=>{setIndustry(name);setQuery('');enter()}}>{name}<span>Coming soon</span></button>)}</div></section>
  <section ref={details} tabIndex={-1} className={`liquid-glass ${styles.catalog}`} aria-label="Building automations">
    <div className={styles.catalogHeader}><div><p className={styles.eyebrow}>{industry?'Industry district':query?'Your workspace':'Inside the building'}</p><h2>{industry??(query?'Search results':selectedBuilding.name)}</h2><p>{industry?`A pack for ${industry.toLowerCase()} is on the way.`:selectedBuilding.purpose}</p></div><label className={styles.search}><span>Search</span><input type="search" placeholder="Search automations" value={query} onChange={e=>{setQuery(e.target.value);setIndustry(null)}}/></label></div>
    {industry?<div className={styles.empty}><h3>Coming soon</h3><p>It will appear here when it’s ready. Meanwhile, explore the buildings above.</p><button onClick={()=>choose('operations')}>Explore Operations</button></div>:error?<div role="alert" className={styles.empty}><h3>Couldn’t load your automations</h3><p>Nothing was changed. Check your connection and try again.</p><button disabled={isValidating} onClick={()=>void mutate()}>{isValidating?'Retrying…':'Try again'}</button></div>:!data?<div role="status" className={styles.empty}>Loading your automations…</div>:visible.length===0?<div className={styles.empty}><h3>{query?'No matching automations':'Coming soon'}</h3><p>{query?'Try another name or choose a building.':'Nothing here yet. New automations for this building are on the way.'}</p><button onClick={()=>{setQuery('');choose('operations')}}>Explore Operations</button></div>:<div className={styles.automationList}>{visible.map((automation,index)=>{
      const status=moduleStatus(automation),info=moduleDetails(automation),open=expanded===automation.id
      return <article key={automation.id} className={styles.automation}>
       <div className={styles.floor} data-lit={status==='Running'} aria-hidden="true"><span>F{visible.length-index}</span></div>
       <div className={styles.floorBody}>
       <div className={styles.automationTop}><div><h3>{automation.displayName}</h3><p>{info.purpose}</p></div><span className={styles.status} data-status={status}>{status}</span></div>
       <dl><div><dt>Good for</dt><dd>{info.audience}</dd></div></dl>
       <div className={styles.automationActions}>{automation.pendingApprovals>0?<Link className={styles.primary} href="/approvals">Review {automation.pendingApprovals} decision{automation.pendingApprovals===1?'':'s'}</Link>:<button className={styles.primary} aria-expanded={open} aria-controls={`activity-${automation.id}`} onClick={()=>setExpanded(open?null:automation.id)}>{open?'Hide activity':'View activity'}</button>}{automation.pendingApprovals>0&&<button aria-expanded={open} aria-controls={`activity-${automation.id}`} onClick={()=>setExpanded(open?null:automation.id)}>{open?'Hide activity':'View activity'}</button>}</div>
       {open&&<div id={`activity-${automation.id}`} className={styles.activity}><h4>Last 24 hours</h4>{automation.runs.length?automation.runs.map(run=><div key={run.id} className={styles.activityRow}><span>{({SUCCESS:'Completed',FAILED:'Failed',RUNNING:'In progress',AWAITING_APPROVAL:'Awaiting approval'} as Record<string,string>)[run.status]??'Status not reported'}</span><time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>{mode==='team'&&data.mode==='internal'&&<p>{run.summary??'No summary recorded.'}</p>}</div>):<p>Nothing ran in the last 24 hours. This does not mean it has never run.</p>}{mode==='team'&&data.mode==='internal'&&<Link href="/trace">Open detailed traces</Link>}</div>}
       </div>
      </article>
    })}</div>}
  </section>
 </section>
}
