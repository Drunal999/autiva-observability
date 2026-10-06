import type { District } from './districts'
export const BUILDINGS = [
 {id:'sales',name:'Sales & Leads',purpose:'Find opportunities and keep conversations moving.',color:'#e9b987',districts:['sales']},
 {id:'marketing',name:'Marketing',purpose:'Help more people discover your business.',color:'#a8bddf',districts:['marketing']},
 {id:'support',name:'Customer Support',purpose:'Keep customer questions organised.',color:'#b5cfba',districts:['support']},
 {id:'finance',name:'Finance & Billing',purpose:'Keep track of invoices and payments.',color:'#d1b6db',districts:['finance']},
 {id:'operations',name:'Operations',purpose:'Keep daily work and your team on track.',color:'#dcc798',districts:['operations','people']},
 {id:'security',name:'Security',purpose:'Review access and protect your business.',color:'#91bcc4',districts:['security']},
 {id:'knowledge',name:'Business Knowledge',purpose:'Bring research and business knowledge together.',color:'#b7c594',districts:['intelligence']},
 {id:'legal',name:'Legal & Compliance',purpose:'A future home for contracts and compliance.',color:'#c8c9d3',districts:[]},
] as const
export type BuildingId = typeof BUILDINGS[number]['id']
export interface CityModule {
 id:string; key:string; displayName:string; district:District; pendingApprovals:number
 agents:{id:string;status:string}[]
 runs:{id:string;ref:string;status:string;summary:string|null;startedAt:string;project:string|null}[]
}
export interface MarketplaceData {districts:CityModule[];sample:boolean;mode?:'internal'|'client'}
export function buildingFor(district:string):BuildingId {
 return BUILDINGS.find(b=>(b.districts as readonly string[]).includes(district))?.id??'operations'
}
export function moduleStatus(module:CityModule):string {
 if(module.pendingApprovals>0||module.agents.some(a=>['FAILED','AWAITING_APPROVAL'].includes(a.status)))return 'Needs attention'
 if(module.agents.some(a=>a.status==='RUNNING'))return 'Running'
 if(!module.agents.length)return 'Status not reported'
 if(module.agents.every(a=>['IDLE','SUCCESS'].includes(a.status)))return 'Not running'
 return 'Status not reported'
}
const DETAILS:Record<string,{purpose:string;audience:string}>={
 'seo-audit':{purpose:'Review a website for search visibility issues.',audience:'Businesses with a website'},
 'lead-followup':{purpose:'Prepare follow-ups for potential customers.',audience:'Teams handling customer enquiries'},
 'inbox-triage':{purpose:'Organise incoming messages for review.',audience:'Teams with a shared inbox'},
 'invoice-chase':{purpose:'Track invoices that need a payment follow-up.',audience:'Businesses that send invoices'},
 'review-replies':{purpose:'Prepare replies to customer reviews.',audience:'Businesses receiving online reviews'},
 'weekly-digest':{purpose:'Bring weekly activity together in one summary.',audience:'Owners and team leads'},
}
export function moduleDetails(module:CityModule){return DETAILS[module.key]??{purpose:'This automation is in your workspace; its description has not been added yet.',audience:'Not documented yet'}}
export const INDUSTRIES=['Cafes','Clinics','Real estate','Retail'] as const
