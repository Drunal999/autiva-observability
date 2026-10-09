/* eslint-disable @typescript-eslint/no-explicit-any -- globals inside a node:vm sandbox are untyped by nature */
import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext,Script} from 'node:vm'
import {resolve} from 'node:path'
const scope:any={}
runInNewContext(readFileSync(resolve('public/city/render-quality.js'),'utf8'),scope)
const policy=scope.AutivaRenderQuality
describe('City render quality',()=>{
 it('preserves desktop detail on a touch laptop and bounds phone resolution',()=>{
  expect(policy.profile(1440,true).name).toBe('desktop')
  expect(policy.create(390,true,3,false).pixelRatio(390,844)).toBe(1.5)
  expect(policy.create(1440,false,2,false).pixelRatio(1440,900)).toBe(2)
 })
 it('reduces resolution after sustained slow frames and recovers gradually',()=>{
  const q=policy.create(390,true,3,false)
  for(let i=0;i<5;i++)expect(q.sample(30)).toBe(false)
  expect(q.sample(30)).toBe(true);expect(q.dpr).toBe(1.375)
  for(let i=0;i<12;i++)q.sample(60)
  expect(q.dpr).toBe(1.5)
  for(let i=0;i<90;i++)q.sample(20)
  expect(q.dpr).toBe(1)
 })
 it('respects saved-data preference and avoids oversized render targets',()=>{
  const q=policy.create(1440,false,3,true)
  expect(q.max).toBe(1.25)
  expect(q.pixelRatio(3840,2160)**2*3840*2160).toBeLessThanOrEqual(6000001)
 })
 it('fits portrait framing and clears quality samples after pausing',()=>{
  expect(policy.radius(390,844)).toBeGreaterThan(policy.radius(1440,900))
  const q=policy.create(390,true,3,false)
  q.sample(10);q.reset();expect(q.count).toBe(0)
 })
 it('reuses completed previews and does not queue another capture during an active one',()=>{
  const html=readFileSync(resolve('public/city/agentic-city.html'),'utf8')
  const start=html.indexOf('var SNAP ='),end=html.indexOf("parent.postMessage({type:'autiva:city-ready'}",start)
  let receive!:(event:any)=>void
  const messages:any[]=[]
  const parent={postMessage:(message:any)=>messages.push(message)}
  const scope:any={parent,location:{origin:'http://localhost'},window:{addEventListener:(_name:string,handler:any)=>{receive=handler}}}
  runInNewContext(html.slice(start,end),scope)
  const request=()=>receive({origin:'http://localhost',source:parent,data:{type:'autiva:city-previews'}})
  request();expect(scope.SNAP.wanted).toBe(true)
  scope.SNAP.wanted=false;scope.SNAP.capture={};request();expect(scope.SNAP.wanted).toBe(false)
  scope.SNAP.capture=null;scope.SNAP.ready={sales:'cached'};request()
  expect(messages[0].previews.sales).toBe('cached');expect(scope.SNAP.wanted).toBe(false)
 })
 it('caps work on a 144 Hz screen without losing the selected target cadence',()=>{
  for(const target of [30,60]){
   const gate=policy.frameGate();let accepted=0
   for(let i=0;i<720;i++)if(gate.take(i*1000/144,target))accepted++
   expect(accepted).toBeGreaterThanOrEqual(target*5-2)
   expect(accepted).toBeLessThanOrEqual(target*5+2)
   gate.reset();expect(gate.take(100000,target)).toBe(true)
  }
 })
 it('queues quality resizes until the next frame and completes drawing after allocation',()=>{
  const html=readFileSync(resolve('public/city/agentic-city.html'),'utf8')
  const start=html.indexOf('var clock = new T.Clock();'),end=html.indexOf('   /ui',start)
  const source=html.slice(start,html.lastIndexOf('/*',end))
  const order:string[]=[]
  const noop=()=>{}
  const material=()=>({material:{uniforms:{uTime:{value:0}}}})
  const ctx:any={
   T:{Clock:class{elapsedTime=0;getDelta(){this.elapsedTime+=0.6;return 0.6}}},
   window:{AutivaRenderQuality:policy},document:{hidden:false,documentElement:{dataset:{hero:'true'}},addEventListener:noop},
   HOST_VISIBLE:true,requestAnimationFrame:()=>1,cancelAnimationFrame:noop,RESIZE_PENDING:false,
   resize:()=>order.push('resize'),RENDER_POLICY:{reset:noop},SIM:{step:noop,weather:{fog:0}},
   water:material(),buildings:material(),ground:material(),flows:material(),foliage:material(),
   landmarks:[],motes:{rotation:{y:0}},rig:{update:noop},SNAP:{wanted:false,capture:null},PENDING_AGENTS:null,
   renderer:{setRenderTarget:noop,clear:noop,render:()=>order.push('draw')},scene:{},camera:{},
   bloom:{main:{},render:()=>order.push('composite')},quality:{bloom:1},UIBUS:{},
  }
  for(const name of ['syncAgents','syncTrails','syncSites','syncLifts','syncUserBodies','syncTraffic','syncFlyers','syncSignals','syncSky','syncLabels','syncInteriorLabels'])ctx[name]=noop
  ctx.tuneQuality=()=>{ctx.RESIZE_PENDING=true}
  runInNewContext(source,ctx)
  ctx.frame(0);expect(order).toEqual(['draw','composite']);expect(ctx.RESIZE_PENDING).toBe(true)
  order.length=0;ctx.frame(34)
  expect(order).toEqual(['resize','draw','composite'])
 })
 it('keeps embedded renderer scripts syntactically valid',()=>{
  const html=readFileSync(resolve('public/city/agentic-city.html'),'utf8')
  const scripts=Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  for(const script of scripts)new Script(script[1])
 })
})
