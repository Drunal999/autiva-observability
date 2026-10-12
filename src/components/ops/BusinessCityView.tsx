'use client'
import {memo,useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import {BUILDINGS,INDUSTRIES,buildingFor,moduleStatus,moduleDetails,type BuildingId,type MarketplaceData} from '@/lib/ops/cityMarketplace'
import {useEventListener} from '@/lib/realtime/client'
import {CITY_FOCUS_EVENT,takeCityFocus} from '@/lib/ops/cityFocus'
import {useWorkspaceMode} from './OpsShell'
import {hasWorkflow} from '@/lib/ops/workflowDefinitions'
const WorkflowEditor=dynamic(()=>import('./WorkflowGraph').then(m=>m.WorkflowEditor),{loading:()=> <p role="status">Opening workflow…</p>})
import {MarketplaceShelf} from './MarketplaceShelf'
import {MarketplaceAds} from './MarketplaceAds'
import {CATALOG} from '@/lib/ops/marketplaceCatalog'
import {Agents as AgentsWidget,NeedsOk as NeedsOkWidget,Today as TodayWidget,Brain as BrainWidget,Automations as AutomationsWidget} from './HomeBento'
import {BoloOrb,useBolo,moodOf} from './BoloOrb'
import {Welcome} from './Welcome'
import {SettingsSheet} from './SettingsSheet'
import {usePrefs} from '@/lib/ops/prefs'
import styles from './BusinessCity.module.css'
const LegacyCity=dynamic(()=>import('./ImmersiveCityView').then(m=>m.ImmersiveCityView),{loading:()=> <p className="p-6">Loading 3D city…</p>})
const Agents=memo(AgentsWidget),NeedsOk=memo(NeedsOkWidget),Today=memo(TodayWidget),Brain=memo(BrainWidget),Automations=memo(AutomationsWidget)
const EMPTY_MODULES:MarketplaceData['districts']=[]
const pauseCity=()=>window.dispatchEvent(new Event('autiva:city-pause'))
const greeting=(hour:number)=>hour<5?'Working late':hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'
/** Bolo on Home: one big orb that starts the same voice session as anywhere else, and three
 *  shortcuts to real places. No language list: Bolo answers in whatever language it is spoken to. */
function BoloCard({onBrowse}:{onBrowse:()=>void}){
 const b=useBolo(),name=usePrefs().assistantName
 return <section className={`liquid-glass ${styles.widget} ${styles.hBolo} ${styles.bolo}`} aria-label={name}>
  <button type="button" className={styles.boloOrb} onClick={b.toggle} disabled={!b.ready} aria-pressed={b.active} aria-label={b.active?`Stop talking to ${name}`:`Talk to ${name}`}><BoloOrb size={88} mood={moodOf(b.status,b.active)}/></button>
  <div className={styles.boloText}>
   <p className={styles.kicker}>{name}</p>
   <h2>{b.active?b.status:'What should we do today?'}</h2>
   <p className={styles.boloHint}>{b.active?'Tap the orb to stop.':b.ready?'Tap the orb and just talk.':b.status}</p>
   <div className={styles.boloChips}><Link href="/approvals">What needs my OK?</Link><Link href="/calendar">Today’s plan</Link><button type="button" onClick={onBrowse}>Browse automations</button></div>
  </div>
 </section>
}
/** The original glowing city as the home hero. Its walkers are a simulation; the live dot on a
 *  district is real (a run in the last 30 minutes). Tapping a building or label opens its category. */
type RealAgent={id:string;name:string;district:string;status:string;step:string|null}
const MemoBoloCard=memo(BoloCard)
function GlowCityView({data,agents,onSelect,explore,active,climate,onPreviews}:{data:MarketplaceData|undefined;agents:RealAgent[];onSelect:(id:BuildingId)=>void;explore:boolean;active:boolean;climate:'auto'|'night'|'day';onPreviews:(p:Record<string,string>)=>void}){
 const frame=useRef<HTMLIFrameElement>(null)
 const pick=useRef(onSelect);pick.current=onSelect
 const shots=useRef(onPreviews);shots.current=onPreviews
 const exploring=useRef(explore);exploring.current=explore
 const activeRef=useRef(active);activeRef.current=active
 const climateRef=useRef(climate);climateRef.current=climate
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'autiva:city-climate',mode:climate},location.origin)},[climate])
 useEffect(()=>{
  const node=frame.current;if(!node)return
  let onScreen=true
  const send=()=>node.contentWindow?.postMessage({type:'autiva:city-visibility',visible:activeRef.current&&onScreen&&!document.hidden},location.origin)
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{onScreen=entries[0]?.isIntersecting??true;send()})
  const pause=()=>node.contentWindow?.postMessage({type:'autiva:city-visibility',visible:false},location.origin)
  window.addEventListener('autiva:city-pause',pause)
  observer?.observe(node);send();document.addEventListener('visibilitychange',send)
  node.addEventListener('load',send)
  return()=>{window.removeEventListener('autiva:city-pause',pause);observer?.disconnect();document.removeEventListener('visibilitychange',send);node.removeEventListener('load',send)}
 },[active])
 useEffect(()=>{
  const post=(msg:object)=>frame.current?.contentWindow?.postMessage(msg,location.origin)
  const send=()=>{post({type:'autiva:city-climate',mode:climateRef.current});post({type:'autiva:city',payload:data??{districts:[]}});post({type:'autiva:city-agents',agents})}
  const listen=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return
   if(event.data?.type==='autiva:city-ready'){send();post({type:'autiva:city-visibility',visible:activeRef.current&&!document.hidden});post({type:'autiva:city-mode',explore:exploring.current});post({type:'autiva:city-previews'})}
   if(event.data?.type==='autiva:city-select'&&BUILDINGS.some(b=>b.id===event.data.building))pick.current(event.data.building)
   if(event.data?.type==='autiva:city-previews'&&event.data.previews&&typeof event.data.previews==='object')shots.current(event.data.previews)
  }
  window.addEventListener('message',listen);send()
  return()=>window.removeEventListener('message',listen)
 },[data,agents])
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'autiva:city-mode',explore},location.origin)},[explore])
 // The iframe is server-rendered and can finish loading before hydration, missing both 'ready' and onLoad.
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'autiva:city-previews'},location.origin)},[])
 // 'ready' can fire before this component listens; load always comes after the city's script ran.
 const hello=()=>{const w=frame.current?.contentWindow;w?.postMessage({type:'autiva:city-climate',mode:climateRef.current},location.origin);w?.postMessage({type:'autiva:city-mode',explore:exploring.current},location.origin);w?.postMessage({type:'autiva:city-previews'},location.origin)}
 return <iframe ref={frame} onLoad={hello} src="/city/agentic-city.html?dashboard=1&hero=1&v=20261008-render2" title="Your business city: tap a building to open its marketplace" className={styles.glowCity}/>
}
const GlowCity=memo(GlowCityView)
/** Runs that STARTED in each 2-hour slot of the last 24 hours, oldest first. Built only from recorded runs. */
function runsByHour(modules:MarketplaceData['districts'],now:number){
 const bins=Array(12).fill(0)
 for(const m of modules)for(const r of m.runs){const age=now-Date.parse(r.startedAt);if(age>=0&&age<864e5)bins[11-Math.floor(age/72e5)]++}
 return bins
}
function Spark({bins}:{bins:number[]}){
 const max=Math.max(1,...bins),pts=bins.map((v,i)=>`${(i/11)*100},${28-(v/max)*24}`).join(' ')
 return <svg className={styles.spark} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={`0,30 ${pts} 100,30`} className={styles.sparkFill}/><polyline points={pts} className={styles.sparkLine}/></svg>
}
const fetcher=async(url:string)=>{const response=await fetch(url);if(!response.ok)throw new Error('Could not load your workspace activity.');return response.json()}
export function BusinessCityView(){
 const {data,error,mutate,isValidating}=useSWR<MarketplaceData>('/api/city',fetcher,{refreshInterval:15000})
 useEventListener(()=>void mutate(),['RUNS','FLEET','APPROVALS'])
 const mode=useWorkspaceMode()
 const [selected,setSelected]=useState<BuildingId>('sales')
 const [query,setQuery]=useState('')
 const [industry,setIndustry]=useState<string|null>(null)
 const [expanded,setExpanded]=useState<string|null>(null)
 const [flow,setFlow]=useState<string|null>(null)
 const [explore,setExplore]=useState(false)
 const [isPhone,setIsPhone]=useState<boolean|null>(null)
 const [cityLoaded,setCityLoaded]=useState(false)
 useEffect(()=>{
  const mq=window.matchMedia('(max-width: 700px)')
  const sync=()=>setIsPhone(mq.matches)
  sync();mq.addEventListener('change',sync)
  return()=>mq.removeEventListener('change',sync)
 },[])
 const openCity=useCallback(()=>{setCityLoaded(true);setExplore(true)},[])
 useEffect(()=>{
  const open=()=>{setCityLoaded(true);setExplore(true)}
  const home=()=>setExplore(false)
  if(new URLSearchParams(window.location.search).get('view')==='city')open()
  window.addEventListener('autiva:open-city',open)
  window.addEventListener('autiva:home',home)
  return()=>{window.removeEventListener('autiva:open-city',open);window.removeEventListener('autiva:home',home)}
 },[])
 const [previews,setPreviews]=useState<Record<string,string>>({})
 const [sheet,setSheet]=useState(false)
 const [custom,setCustom]=useState(false)
 const prefs=usePrefs(),show=(c:string)=>!prefs.hidden.includes(c as never)
 useEffect(()=>{
  if(!sheet)return
  const before=document.activeElement as HTMLElement|null
  const dialog=details.current?.closest('[role="dialog"]') as HTMLElement|null
  const oldOverflow=document.body.style.overflow
  document.body.style.overflow='hidden';dialog?.focus()
  const esc=(e:KeyboardEvent)=>{
   if(e.key==='Escape')setSheet(false)
   if(e.key!=='Tab'||!dialog)return
   const items=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length>0)
   const first=items[0],last=items[items.length-1]
   if(!first){e.preventDefault();dialog.focus();return}
   if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){e.preventDefault();first.focus()}
  }
  window.addEventListener('keydown',esc)
  return()=>{document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',esc);before?.focus()}
 },[sheet])
 useEffect(()=>{if(!explore)return;const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setExplore(false)};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc)},[explore])
 const [legacy,setLegacy]=useState(false)
 const [clock,setClock]=useState<{label:string;night:boolean;hour:number;day:string;at:number}|null>(null)
 const [requestedModule,setRequestedModule]=useState<string|null>(null)
 const details=useRef<HTMLElement>(null)
 useEffect(()=>{const tick=()=>{const date=new Date();setClock({label:new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date),night:date.getHours()<6||date.getHours()>=19,hour:date.getHours(),day:new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(date),at:date.getTime()})};tick();const timer=setInterval(tick,60000);return()=>clearInterval(timer)},[])
 useEffect(()=>{setRequestedModule(takeCityFocus());const focus=(e:Event)=>{takeCityFocus();setRequestedModule((e as CustomEvent<string>).detail)};window.addEventListener(CITY_FOCUS_EVENT,focus);return()=>window.removeEventListener(CITY_FOCUS_EVENT,focus)},[])
 useEffect(()=>{if(!requestedModule||!data||error)return;const automation=data.districts.find(m=>m.id===requestedModule);if(automation){setSelected(buildingFor(automation.district));setExpanded(automation.id);setIndustry(null);setQuery('');setLegacy(false);setSheet(true);setRequestedModule(null)}},[requestedModule,data,error])
 const modules=error?EMPTY_MODULES:data?.districts??EMPTY_MODULES
 const {data:agentRows}=useSWR<{agents?:{id:string;name:string;status:string;currentStep:string|null}[]}|{id:string;name:string;status:string;currentStep:string|null}[]>('/api/agents',fetcher,{refreshInterval:15000})
 const realAgents=useMemo<RealAgent[]>(()=>{
  const rows=Array.isArray(agentRows)?agentRows:agentRows?.agents??[]
  const where=new Map(modules.flatMap(m=>m.agents.map(a=>[a.id,m.district] as const)))
  return rows.filter(a=>where.has(a.id)).map(a=>({id:a.id,name:a.name,district:where.get(a.id)!,status:a.status,step:a.currentStep}))
 },[agentRows,modules])
 const selectedBuilding=BUILDINGS.find(b=>b.id===selected)!
 const visible=modules.filter(m=>query?`${m.displayName} ${moduleDetails(m).purpose}`.toLowerCase().includes(query.toLowerCase()):buildingFor(m.district)===selected)
 // Catalogue items not already installed here (catalog keys may be dotted: marketing.content_studio).
 const offer=useMemo(()=>{const keys=new Set(modules.map(m=>m.key.toLowerCase().split('.').pop()!.replace(/_/g,'-')));return CATALOG.filter(c=>!keys.has(c.key))},[modules])
 const extra=useMemo(()=>offer.filter(c=>query?`${c.name} ${c.purpose}`.toLowerCase().includes(query.toLowerCase()):c.building===selected),[offer,query,selected])
 const pack=(name:string)=>offer.filter(c=>c.industries?.includes(name))
 const running=modules.filter(m=>moduleStatus(m)==='Running').length
 const bins=clock?runsByHour(modules,clock.at):[]
 const enter=useCallback(()=>{pauseCity();setSheet(true)},[])
 const choose=useCallback((id:BuildingId)=>{setExplore(false);setSelected(id);setQuery('');setIndustry(null);setExpanded(null);enter()},[enter])
 const customise=()=>{pauseCity();setCustom(true)}
 if(legacy)return <><div className={`liquid-glass ${styles.returnBar}`}><button onClick={()=>setLegacy(false)}>Back to your business city</button><span>Original 3D view</span></div><LegacyCity/></>
 return <section className={styles.workspace} data-explore={explore} data-covered={sheet||custom}>
  {explore&&<button className={`liquid-glass ${styles.exploreBack}`} onClick={()=>setExplore(false)}>← Back to home</button>}
  <Welcome previews={previews}/>
  {custom&&<SettingsSheet onClose={()=>setCustom(false)}/>}
  <div className={styles.stageCity}>{(isPhone===false||(cityLoaded&&explore))&&<GlowCity data={error?undefined:data} agents={realAgents} active={!sheet&&!custom} climate={prefs.cityClimate} onSelect={choose} explore={explore} onPreviews={setPreviews}/>}</div>
  <section className={styles.phoneCity} aria-label="Business city overview">
   <div className={styles.phoneCityHead}><p>AUTIVA / CITY</p><span>{error?'Offline':!data?'Connecting':data.sample?'Demo workspace':'Workspace connected'}</span></div>
   <h2>Your business.<br/><span>Your city.</span></h2>
   <p>Explore a district. See its work. Make your next decision.</p>
   <div className={styles.citySkyline} aria-hidden="true">{BUILDINGS.slice(0,6).map((b,i)=><span key={b.id} style={{'--district':b.glow,'--tower-height':`${45+(i*23)%67}px`} as CSSProperties}><i/><i/><i/></span>)}</div>
   <button className={styles.cityLaunch} onClick={openCity}>Enter your city <span aria-hidden="true">↗</span></button>
   <p className={styles.phoneCityNote}>3D loads when you enter. Status comes from workspace records.</p>
  </section>
  {explore&&<nav className={styles.districtDock} aria-label="City districts">{BUILDINGS.map(b=><button key={b.id} onClick={()=>choose(b.id)} style={{'--district':b.glow} as CSSProperties}>{b.name}</button>)}</nav>}
  <section className={styles.home} aria-label="Workspace summary">
   <header className={`${styles.top} ${styles.hGreet}`}>
    <p className={styles.date}>{clock?.day??'\u00a0'}</p><h1>{clock?greeting(clock.hour):'Welcome back'}</h1>
    <div className={styles.greetActions}>
     <button className={`liquid-glass ${styles.exploreBtn}`} onClick={openCity}>Explore the city</button>
     <button className={`liquid-glass ${styles.exploreBtn}`} onClick={()=>enter()}>Marketplace</button>
     <button className={`liquid-glass ${styles.exploreBtn}`} onClick={customise}>Customise</button>
     {mode==='team'&&<button className={`liquid-glass ${styles.exploreBtn}`} onClick={()=>setLegacy(true)}>Original 3D view</button>}
    </div>
   </header>
   <MemoBoloCard onBrowse={enter}/>
   <section className={`liquid-glass ${styles.widget} ${styles.hNow}`} aria-label="Right now">
    <p className={styles.kicker}>Right now</p>
    <div className={styles.liveRow}><p className={styles.liveNum}>{error||!data?'—':running}</p>{!error&&data&&clock&&bins.some(Boolean)&&<Spark bins={bins}/>}</div>
    <p className={styles.liveText}>{error?'Activity unavailable':!data?'Connecting to your city…':running===0?'Your city is quiet':running===1?'automation working for you':'automations working for you'}</p>
    {!error&&data&&clock&&<p className={styles.sparkNote}>{bins.reduce((n,v)=>n+v,0)} run{bins.reduce((n,v)=>n+v,0)===1?'':'s'} started in the last 24 hours · {modules.length} in your workspace</p>}
    <p className={styles.note}>{error?'No records were changed.':!data?'':data.sample?'Sample workspace · These are example records.':'Based on recorded workspace activity.'}</p>
   </section>
   {show('agents')&&<div className={styles.hAgents}><Agents/></div>}
   {show('ok')&&<div className={styles.hOk}><NeedsOk/></div>}
   {show('today')&&<div className={styles.hToday}><Today/></div>}
   {show('brain')&&<div className={styles.hBrain}><Brain/></div>}
   {show('autos')&&<div className={styles.hAutos}><Automations modules={modules}/></div>}
  </section>
  {sheet&&<div className={styles.sheetBackdrop} onClick={()=>setSheet(false)}>
  <div role="dialog" aria-modal="true" aria-label="Marketplace" tabIndex={-1} className={`liquid-glass ${styles.sheet}`} onClick={e=>e.stopPropagation()}>
  <section ref={details} tabIndex={-1} className={`liquid-glass ${styles.catalog}`} style={{'--c':industry||query?'#8e8e93':selectedBuilding.glow} as CSSProperties} aria-label="Building automations">
    <div className={styles.catalogHeader}><div><p className={styles.eyebrow}>{industry?'Industry district':query?'Your workspace':'Marketplace · inside the building'}</p><h2>{industry??(query?'Search results':selectedBuilding.name)}</h2><p>{industry?pack(industry).length?`Automations designed for ${industry}.`:`A pack for ${industry.toLowerCase()} is on the way.`:selectedBuilding.purpose}</p></div><div className={styles.headTools}><label className={styles.search}><span>Search</span><input type="search" placeholder="Search automations" value={query} onChange={e=>{setQuery(e.target.value);setIndustry(null)}}/></label><button type="button" className={styles.sheetClose} onClick={()=>setSheet(false)}>Close</button></div></div>
    {!industry&&!query&&<MarketplaceAds onOpen={(building,key)=>{choose(building);setFlow('catalog:'+key)}}/>}
    <div className={styles.mobileBuildings} role="group" aria-label="Choose a building">{BUILDINGS.map(b=><button key={b.id} onClick={()=>choose(b.id)} aria-pressed={!industry&&selected===b.id}><span className={styles.shot} aria-hidden="true">{previews[b.id]?<img src={previews[b.id]} alt=""/>:<span>{b.id==='security'||b.id==='legal'?'No building yet':'Loading…'}</span>}</span><span className={styles.chipName}><span className={styles.chipDot} style={{background:b.glow}} aria-hidden="true"/>{b.name}</span><span className={styles.tileCount} aria-hidden="true">{!data||error?'\u00a0':((n,m)=>n&&m?`${n} live · ${m} to add`:n?`${n} automation${n===1?'':'s'}`:m?`${m} to add`:'Coming soon')(modules.filter(m=>buildingFor(m.district)===b.id).length,offer.filter(c=>c.building===b.id).length)}</span></button>)}</div>
    
    {industry&&pack(industry).length?<MarketplaceShelf items={pack(industry)} flow={flow} setFlow={setFlow} title={`Made for ${industry}`}/>:industry?<div className={styles.empty}><h3>Coming soon</h3><p>It will appear here when it’s ready. Meanwhile, explore the buildings above.</p><button onClick={()=>choose('operations')}>Explore Operations</button></div>:error?<div role="alert" className={styles.empty}><h3>Couldn’t load your automations</h3><p>Nothing was changed. Check your connection and try again.</p><button disabled={isValidating} onClick={()=>void mutate()}>{isValidating?'Retrying…':'Try again'}</button></div>:!data?<div role="status" className={styles.empty}>Loading your automations…</div>:visible.length===0&&extra.length===0?<div className={styles.empty}><h3>{query?'No matching automations':'Coming soon'}</h3><p>{query?'Try another name or choose a building.':'Nothing here yet. New automations for this building are on the way.'}</p><button onClick={()=>{setQuery('');choose('operations')}}>Explore Operations</button></div>:<>{visible.length>0&&<div className={styles.automationList}>{visible.map(automation=>{
      const status=moduleStatus(automation),info=moduleDetails(automation),open=expanded===automation.id
      return <article key={automation.id} className={styles.automation} data-wide={flow===automation.id}>
       <div className={styles.tile} data-lit={status==='Running'} aria-hidden="true"><b>{automation.displayName.charAt(0)}</b><span>L{modules.filter(m=>buildingFor(m.district)===buildingFor(automation.district)).findIndex(m=>m.id===automation.id)+1}</span></div>
       <div className={styles.floorBody}>
       <div className={styles.automationTop}><div><h3>{automation.displayName}</h3><p>{info.purpose}</p></div><span className={styles.status} data-status={status}>{status}</span></div>
       <dl><div><dt>Good for</dt><dd>{info.audience}</dd></div></dl>
       <div className={styles.automationActions}>{automation.pendingApprovals>0?<Link className={styles.primary} href="/approvals">Review {automation.pendingApprovals} decision{automation.pendingApprovals===1?'':'s'}</Link>:<button className={styles.primary} aria-expanded={open} aria-controls={`activity-${automation.id}`} onClick={()=>setExpanded(open?null:automation.id)}>{open?'Hide activity':'View activity'}</button>}{automation.pendingApprovals>0&&<button aria-expanded={open} aria-controls={`activity-${automation.id}`} onClick={()=>setExpanded(open?null:automation.id)}>{open?'Hide activity':'View activity'}</button>}<button aria-expanded={flow===automation.id} onClick={()=>setFlow(flow===automation.id?null:automation.id)}>{flow===automation.id?'Hide how it works':hasWorkflow(automation.key)?'How it works':'How it works (not mapped)'}</button></div>
       {flow===automation.id&&(()=>{const b=BUILDINGS.find(x=>x.id===buildingFor(automation.district))!;return <WorkflowEditor name={automation.displayName} moduleKey={automation.key} building={b.name} glow={b.glow} running={status==='Running'} runs={automation.runs}/>})()}
       {open&&<div id={`activity-${automation.id}`} className={styles.activity}><h4>Agent desks</h4><p>Layers group automations visually; these desks show assigned workspace agents.</p>
        <div className={styles.agentDesks}>{automation.agents.length?automation.agents.map(agent=>{
         const live=realAgents.find(a=>a.id===agent.id)
         return <article key={agent.id} className={styles.agentDesk}><strong>{live?.name??agent.name??agent.id}</strong><span>{({RUNNING:'Working',AWAITING_APPROVAL:'Waiting for approval',FAILED:'Needs attention',SUCCESS:'Completed',IDLE:'Idle'} as Record<string,string>)[live?.status??agent.status]??'Status not reported'}</span><p>{live?.step??'No current step reported.'}</p></article>
        }):<p>No agents assigned to this automation.</p>}</div><h4>Last 24 hours</h4>{automation.runs.length?automation.runs.map(run=><div key={run.id} className={styles.activityRow}><span>{({SUCCESS:'Completed',FAILED:'Failed',RUNNING:'In progress',AWAITING_APPROVAL:'Awaiting approval'} as Record<string,string>)[run.status]??'Status not reported'}</span><time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>{mode==='team'&&data.mode==='internal'&&<p>{run.summary??'No summary recorded.'}</p>}</div>):<p>Nothing ran in the last 24 hours. This does not mean it has never run.</p>}{mode==='team'&&data.mode==='internal'&&<Link href="/trace">Open detailed traces</Link>}</div>}
       </div>
      </article>
    })}</div>}<MarketplaceShelf items={extra} flow={flow} setFlow={setFlow}/></>}
  </section>
  <section className={`liquid-glass ${styles.industries}`} aria-label="Industry districts"><div><h3>Made for your industry</h3><p>Ready-made packs for your kind of business are coming soon.</p></div><div>{INDUSTRIES.map(name=><button key={name} aria-pressed={industry===name} onClick={()=>{setIndustry(name);setQuery('');enter()}}>{name}<span>{pack(name).length?`${pack(name).length} automations`:'Coming soon'}</span></button>)}</div></section>
  </div></div>}
 </section>
}
