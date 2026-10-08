'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import type { FleetResponse } from '@/types/agentOps'
import type { ApprovalsResponse } from '@/types/approvals'
import { SIMPLE_NAV, TEAM_NAV, ASSISTANT_HREF, workspaceMode, type WorkspaceMode } from '@/lib/ops/workspaceNavigation'
import { usePresence } from './Presence'
import { TeamAvatars, TeamList, useTeam } from './TeamPresence'
import { AutivaAssistant } from './AutivaAssistant'
import { BoloOrb } from './BoloOrb'
import { FactBubble } from './FactBubble'
import { useEventListener } from '@/lib/realtime/client'
import styles from './WorkspaceShell.module.css'
const ModeContext = createContext<WorkspaceMode>('simple')
export const useWorkspaceMode = () => useContext(ModeContext)
const fetcher = async (url: string) => { const r=await fetch(url); if(!r.ok) throw new Error('Workspace unavailable'); return r.json() }
const IS_SAMPLE_DATA = process.env.NEXT_PUBLIC_SAMPLE_DATA !== 'false'
type Appearance = 'system' | 'light' | 'dark'
/** Routes whose styles read the appearance tokens. Every other page is still
 *  dark-only, so it stays dark whatever the preference says. */
const LIGHT_READY = new Set(['/city'])
export function OpsShell({ children }: { children: React.ReactNode }) {
  const pathname=usePathname()
  const [mode,setMode]=useState<WorkspaceMode>('simple')
  const [menu,setMenu]=useState(false)
  const [appearance,setAppearance]=useState<Appearance>('system')
  useEffect(()=>{try{const v=localStorage.getItem('autiva.appearance');if(v==='light'||v==='dark')setAppearance(v)}catch{/* Preference is optional. */}},[])
  useEffect(()=>{
    const mq=window.matchMedia?.('(prefers-color-scheme: light)')
    const apply=()=>{const wanted=appearance==='system'?(mq?.matches?'light':'dark'):appearance;document.documentElement.dataset.theme=LIGHT_READY.has(pathname)?wanted:'dark'}
    apply();mq?.addEventListener?.('change',apply)
    return()=>mq?.removeEventListener?.('change',apply)
  },[appearance,pathname])
  const changeAppearance=(next:Appearance)=>{setAppearance(next);try{localStorage.setItem('autiva.appearance',next)}catch{/* Preference is optional. */}}
  useEffect(()=>{try{setMode(workspaceMode(localStorage.getItem('autiva.workspace-mode')))}catch{/* Private browsing still works. */}},[])
  const changeMode=(next:WorkspaceMode)=>{setMode(next);try{localStorage.setItem('autiva.workspace-mode',next)}catch{/* Preference is optional. */}}
  const {data,error}=useSWR<FleetResponse>('/api/agents',fetcher,{refreshInterval:20000})
  const {data:approvals,error:approvalError}=useSWR<ApprovalsResponse>('/api/approvals',fetcher,{refreshInterval:20000})
  const {data:notifs,mutate:refreshNotifs}=useSWR<{unread:{id:string;kind?:string}[]}>('/api/notifications',fetcher,{refreshInterval:60000})
  useEventListener(()=>void refreshNotifs(),['COMMENTS'])
  const current=[...SIMPLE_NAV,...TEAM_NAV].find(n=>n.href===pathname)
  const roster=usePresence(current?.label??'the dashboard')
  const team=useTeam(roster)
  const failures=data?.agents?.filter(a=>a.status==='FAILED').length??0
  const pending=approvalError?undefined:approvals?.pending?.length
  const teamPage=TEAM_NAV.find(n=>n.href===pathname)
  const navLink=(n:{href:string;label:string;glyph:string})=><Link key={n.href} href={n.href} onClick={()=>setMenu(false)} aria-current={pathname===n.href?'page':undefined} className={styles.navLink}><span aria-hidden="true">{n.glyph}</span><span>{n.label}</span>{n.href==='/approvals'&&pending!==undefined&&pending>0&&<b aria-label={`${pending} approvals waiting`}>{pending}</b>}{n.href==='/chat'&&!!notifs?.unread.length&&<b aria-label={`${notifs.unread.length} unread`}>{notifs.unread.length}</b>}</Link>
  return <ModeContext.Provider value={mode}><div className={styles.shell}>
    <a className={styles.skip} href="#workspace-content">Skip to content</a>
    <header className={`liquid-glass ${styles.header}`}>
      <Link href="/city" className={styles.brand}><span aria-hidden="true">a</span>AUTIVA</Link>
      <div className={styles.headerStatus}>
        {IS_SAMPLE_DATA&&<span className={styles.sample} title="These records are examples, not production results.">Sample data</span>}
        {mode==='team'&&<span className={styles.health}>{error?'Activity unavailable':!data?'Connecting…':failures?`${failures} ${IS_SAMPLE_DATA?'sample ':''}agent${failures===1?'':'s'} need attention`:'No agent failures reported'}</span>}
        <TeamAvatars team={team}/>
        <button type="button" className={styles.menuButton} aria-expanded={menu} aria-controls="workspace-navigation" onClick={()=>setMenu(!menu)}>Menu</button>
      </div>
    </header>
    <aside id="workspace-navigation" className={`liquid-glass ${styles.sidebar} ${menu?styles.open:''}`}>
      <nav aria-label="Business navigation">{SIMPLE_NAV.map(navLink)}</nav>
      {mode==='team'&&<nav aria-label="Team navigation" className={styles.teamNav}><p>Team workspace</p>{TEAM_NAV.map(navLink)}</nav>}
      {mode==='simple'&&teamPage&&<div className={styles.context}><p>You opened a team view.</p>{navLink(teamPage)}<button onClick={()=>changeMode('team')}>Show all team tools</button></div>}
      <TeamList team={team}/>
      {/* Settings live at the bottom, out of the way of everyday navigation. */}
      <div className={styles.sidebarFoot}>
        <p className={styles.footLabel}>View</p>
        <div className={styles.mode} role="group" aria-label="Workspace mode">
          <button aria-pressed={mode==='simple'} onClick={()=>changeMode('simple')}>Simple</button>
          <button aria-pressed={mode==='team'} onClick={()=>changeMode('team')}>Team</button>
        </div>
        <p className={styles.footLabel}>Appearance</p>
        <div className={styles.mode} role="group" aria-label="Appearance">{(['system','light','dark'] as const).map(v=><button key={v} aria-pressed={appearance===v} onClick={()=>changeAppearance(v)}>{v==='system'?'Auto':v==='light'?'Light':'Dark'}</button>)}</div>
      </div>
    </aside>
    <main id="workspace-content" tabIndex={-1} className={styles.main}>{children}</main>
    <nav aria-label="Tabs" className={styles.tabBar}>
      <div className={`liquid-glass ${styles.tabs}`}>{SIMPLE_NAV.filter(n=>n.href!==ASSISTANT_HREF).map(n=><Link key={n.href} href={n.href} aria-current={pathname===n.href?'page':undefined} className={styles.tab}><span aria-hidden="true">{n.glyph}</span>{n.short}{n.href==='/approvals'&&pending!==undefined&&pending>0&&<b aria-label={`${pending} approvals waiting`}>{pending}</b>}</Link>)}</div>
      <Link href={ASSISTANT_HREF} aria-label="Talk to Bolo" aria-current={pathname===ASSISTANT_HREF?'page':undefined} className={`liquid-glass ${styles.bolo}`}><BoloOrb size={38}/></Link>
    </nav>
    {mode==='team'&&<FactBubble/>}<AutivaAssistant/>
  </div></ModeContext.Provider>
}
