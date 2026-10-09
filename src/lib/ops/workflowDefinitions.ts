import graphs from './workflowGraphs.json'
import {BLUEPRINTS,type Graph} from './workflowBlueprints'
const REAL=graphs as Record<string,Graph[]>
const norm=(key:string)=>key.toLowerCase().split('.').pop()!.replace(/_/g,'-')
export function layersFor(key:string):{graphs:Graph[];blueprint:boolean} {
 const k=norm(key)
 if(REAL[k])return {graphs:REAL[k],blueprint:false}
 return BLUEPRINTS[k]?{graphs:[BLUEPRINTS[k]],blueprint:true}:{graphs:[],blueprint:false}
}
export const hasWorkflow=(key:string)=>layersFor(key).graphs.length>0
