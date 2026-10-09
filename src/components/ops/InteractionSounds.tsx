'use client'
import {useEffect,useState} from 'react'
import type {UISFXPlayer} from 'uisfx'

/** Optional enhancement: audio never delays navigation or reports an action's outcome. */
export function InteractionSounds({enabled}:{enabled:boolean}) {
 const [unavailable,setUnavailable]=useState(false)
 useEffect(()=>{
  setUnavailable(false)
  if(!enabled)return
  let disposed=false,player:UISFXPlayer|undefined
  // Prepare only when enabled. AudioContext itself is unlocked in a trusted click.
  void import('uisfx').then(({createUISFX})=>{
   if(disposed)return
   player=createUISFX({pack:'minimal',volume:0.22,enabled:true,maxVoices:2,cooldownMs:90})
  }).catch(()=>{if(!disposed)setUnavailable(true)})
  const click=(event:MouseEvent)=>{
   if(!event.isTrusted||!player||document.hidden)return
   const control=event.target instanceof Element?event.target.closest('button,a[href]'):null
   if(!control||control.matches(':disabled,[aria-disabled="true"],[data-sound="off"]'))return
   const current=player
   // Start unlock inside the gesture; never await sound in the action handler.
   void current.unlock().then(ready=>{
    if(disposed)return
    if(!ready){setUnavailable(true);return}
    current.play(control.tagName==='A'?'forward':'press')
   }).catch(()=>{if(!disposed)setUnavailable(true)})
  }
  const hide=()=>{if(document.hidden)player?.stopAll()}
  document.addEventListener('click',click)
  document.addEventListener('visibilitychange',hide)
  return()=>{disposed=true;document.removeEventListener('click',click);document.removeEventListener('visibilitychange',hide);player?.stopAll();void player?.destroy()}
 },[enabled])
 return unavailable?<span role="status">Click sounds unavailable on this device.</span>:null
}
