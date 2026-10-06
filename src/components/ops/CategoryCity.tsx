'use client'
import type {CSSProperties} from 'react'
import {BUILDINGS,type BuildingId} from '@/lib/ops/cityMarketplace'
import styles from './CategoryCity.module.css'

/**
 * The business city in real 3D, from CSS transforms alone: no WebGL, no
 * library, nothing to download. Each category is an extruded tower on a
 * tilted ground plane; the camera sways slowly and every label is
 * counter-rotated so it always faces the viewer.
 *
 * Windows are lit only for a building whose status is Running; a building
 * with nothing in it yet wears scaffolding. Nothing here is decorative data.
 */
const LOTS: {x:number;y:number;h:number}[] = [
  {x:70,y:70,h:230},{x:290,y:70,h:280},{x:510,y:70,h:200},{x:730,y:70,h:255},
  {x:70,y:400,h:190},{x:290,y:400,h:265},{x:510,y:400,h:220},{x:730,y:400,h:200},
]
const TREES = [[230,300],[460,330],[660,300],[880,330],[30,300],[460,40],[230,620],[660,620]]

export function CategoryCity({selected,onSelect,night,labels}:{selected:BuildingId|null;onSelect:(id:BuildingId)=>void;night:boolean;labels:Record<string,string>}) {
 return <div className={styles.viewport} data-night={night} role="group" aria-label="Your business city. Choose a category building.">
  <div className={styles.scene}>
   <div className={styles.ground}>
    <div className={styles.roadH}/><div className={styles.roadV} style={{left:255}}/><div className={styles.roadV} style={{left:695}}/>
    <div className={styles.park}><span>AUTIVA PARK</span></div>
    {TREES.map(([x,y],i)=><div key={i} className={styles.tree} style={{left:x,top:y}}><span/></div>)}
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
