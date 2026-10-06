'use client'
import {BUILDINGS,type BuildingId} from '@/lib/ops/cityMarketplace'
import styles from './BusinessCity.module.css'
/** Vector buildings stay crisp without a GPU, external assets or decorative activity counters. */
export function CategoryCity({selected,onSelect,night,labels}:{selected:BuildingId|null;onSelect:(id:BuildingId)=>void;night:boolean;labels:Record<string,string>}) {
 return <svg viewBox="0 0 960 530" className={styles.map} aria-label="Your business city. Choose a category building." role="group" data-night={night}>
   <rect width="960" height="530" rx="22" className={styles.ground}/>
   <path d="M0 262H960 M245 0V530 M725 0V530" stroke={night?'#3c5754':'#d4dfd5'} strokeWidth="38"/>
   <path d="M0 262H960 M245 0V530 M725 0V530" stroke={night?'#729087':'#f7faf4'} strokeWidth="2" strokeDasharray="8 12"/>
   <ellipse cx="480" cy="262" rx="99" ry="35" fill={night?'#284f45':'#b7d2b6'}/>
   <ellipse cx="480" cy="258" rx="33" ry="13" fill="#8eafb6"/><ellipse cx="480" cy="254" rx="25" ry="8" fill="#c4dce1"/>
   <text x="480" y="299" textAnchor="middle" fill={night?'#adc5b9':'#567267'} fontSize="11" letterSpacing="3">AUTIVA PARK</text>
   {[50,190,290,670,790,910].map((x,i)=><g key={x} transform={`translate(${x} ${i%2?244:286})`} aria-hidden="true"><ellipse cy="5" rx="13" ry="5" fill="#244b3520"/><path d="M0 0v-20" stroke="#7c8260" strokeWidth="4"/><ellipse cy="-22" rx="11" ry="15" fill={i%2?'#89aa8c':'#a1b99a'}/></g>)}
   {BUILDINGS.map((building,i)=>{
    const x=120+(i%4)*240,y=i<4?184:437,h=[87,110,76,96,73,108,88,78][i]
    return <g key={building.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Enter ${building.name}`} aria-pressed={selected===building.id} className={styles.building} onClick={()=>onSelect(building.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(building.id)}}}>
      <title>{`${building.name}: ${building.purpose}`}</title>
      <ellipse cy="5" rx="86" ry="25" fill={selected===building.id?'#54877648':'#294b3a12'} stroke={selected===building.id?'#386f5b':'transparent'} strokeWidth="2"/>
      <g className={styles.buildingShape}>
       <path d={`M-53 -${h}L12 -${h+26}L62 -${h+5}L-4 -${h-21}Z`} fill={building.color}/>
       <path d={`M-53 -${h}L-4 -${h-21}V4L-53 -17Z`} fill={building.color}/>
       <path d={`M-4 -${h-21}L62 -${h+5}V-21L-4 4Z`} fill={building.color}/>
       <path d={`M-4 -${h-21}L62 -${h+5}V-21L-4 4Z`} fill="#253f4622"/>
       {[0,1,2].map(row=><g key={row} transform={`translate(0 ${-h+37+row*19})`} fill={night?'#f1d9a0':'#eef4ed'}><path d="M-43 -15l9 4v10l-9 -4Z M-25 -8l9 4v10l-9 -4Z M8 0l10 -4v10l-10 4Z M29 -8l10 -4v10l-10 4Z M49 -16l7 -3v10l-7 3Z"/></g>)}
       <path d="M18 -8v-20l13 -5v20Z" fill="#45635f"/>
       {i===0&&<path d="M-56 -44l51 20l69 -26v11L-5 -12l-51 -20Z" fill="#f8eee0"/>}
       {i===3&&<path d={`M-22 -${h+7}v-12l20 -8l17 7v13`} fill="#ece3f0"/>}
      </g>
      <rect x="-105" y="20" width="210" height="35" rx="11" className={styles.buildingLabel}/>
      <text y="42" textAnchor="middle" fontSize="14" fontWeight="600" className={styles.buildingText}>{building.name}</text>
      <text y="72" textAnchor="middle" fontSize="11" fill={night?"#c6d8cc":"#506c59"}>{labels[building.id]}</text>
    </g>
   })}
 </svg>
}
