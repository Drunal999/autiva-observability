'use client'
import type {CSSProperties} from 'react'
import {BUILDINGS,type BuildingId} from '@/lib/ops/cityMarketplace'
import styles from './CategoryCity.module.css'

/**
 * The business city in real 3D, from CSS transforms alone: no WebGL, no
 * library, nothing to download. Each category is an extruded tower on a
 * tilted glass ground plane; the camera sways slowly and every label is
 * counter-rotated so it always faces the viewer.
 *
 * Floor bands glow only for a building whose status is Running; a building
 * with nothing in it yet is drawn faint. Nothing here is decorative data.
 */
const LOTS: {x:number;y:number;h:number}[] = [
  {x:70,y:70,h:230},{x:290,y:70,h:280},{x:510,y:70,h:200},{x:730,y:70,h:255},
  {x:70,y:400,h:190},{x:290,y:400,h:265},{x:510,y:400,h:220},{x:730,y:400,h:200},
]

export function CategoryCity({selected,onSelect,night,labels,hero=false}:{selected:BuildingId|null;onSelect:(id:BuildingId)=>void;night:boolean;labels:Record<string,string>;hero?:boolean}) {
 return <div className={styles.viewport} data-night={night} data-hero={hero} role="group" aria-label="Your business city. Choose a category building.">
  <div className={styles.scene}>
   <div className={styles.ground}>
    <div className={styles.roadH}/><div className={styles.roadV} style={{left:260}}/><div className={styles.roadV} style={{left:700}}/>
    <div className={styles.park}><span>AUTIVA PARK</span></div>
    {BUILDINGS.map((building,i)=>{
     const lot=LOTS[i], status=labels[building.id]??''
     const state=status==='Running'?'lit':status==='Coming soon'?'soon':'dim'
     const vars={'--c':building.color,'--h':`${lot.h}px`,'--i':i,left:lot.x,top:lot.y} as CSSProperties
     return <button key={building.id} type="button" className={styles.tower} style={vars} data-state={state}
       aria-label={`Enter ${building.name}`} aria-pressed={selected===building.id} title={`${building.name}: ${building.purpose}`}
       onClick={()=>onSelect(building.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(building.id)}}}>
      <span className={styles.pad} aria-hidden="true"/>
      <span className={styles.body} aria-hidden="true">
       <span className={`${styles.face} ${styles.n}`}/><span className={`${styles.face} ${styles.s}`}/>
       <span className={`${styles.face} ${styles.w}`}/><span className={`${styles.face} ${styles.e}`}/>
       <span className={`${styles.face} ${styles.top}`}/>
      </span>
      <span className={styles.label}><b>{building.name}</b><small>{status}</small></span>
     </button>
    })}
   </div>
  </div>
 </div>
}
