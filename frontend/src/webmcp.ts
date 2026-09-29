import { api } from './api';
import type { SiteData } from './types';
type Tool = {name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>Promise<unknown>};
export function registerPublicTools() {
  const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  try {
    void Promise.resolve(context.registerTool({
      name:'list_published_beauty_services',title:'View available beauty services',
      description:'Read the currently published services and academy courses at Choose Me. Does not create or confirm an appointment.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:true},
      async execute(input){
        if(typeof input!=='object'||input===null||Array.isArray(input)||Object.keys(input).length)throw new Error('Provide an empty object.');
        const data=await api<SiteData>('/site');
        return {services:data.services.map(({id,title,description,price,duration})=>({id,title,description,price,duration})),courses:data.courses.map(({id,title,description})=>({id,title,description})),phone:data.settings.internationalPhone};
      },
    },{signal:lifecycle.signal})).catch(()=>{});
  } catch { /* Optional experimental browser capability. */ }
  return ()=>lifecycle.abort();
}
