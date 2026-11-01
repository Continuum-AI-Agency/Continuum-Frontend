/** Real Chrome + production journals + genuine APIs. Browser-module proof, separate from GUI proof. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, readlinkSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page, type Route } from 'playwright';
import { z } from 'zod';
import type { NativeCopyIdentity, NativeCopyState } from '../src/components/forge/native/nativeWorkingCopy';
import type { VersioningIntent } from '../src/components/forge/versioningIntent';

type Data = Record<string, unknown>;
const object = z.record(z.string(), z.unknown());
const boundary = z.enum(['capture-before-commit','capture-after-commit','send-before-http','send-after-http','ack-before-commit','ack-after-commit','sigkill-awaiting-response']);
const actionCase = z.object({ id:z.string(), command:z.string(), boundary, input:object,
  advance:z.object({ command:z.string(), input:object }) });
const identity = z.object({ userId:z.string(),brandId:z.string(),templateId:z.string(),variantId:z.string(),family:z.enum(['blender','hyperframes']),
  baseRevisionId:z.string(),sourceAssetId:z.string(),sourceVersionId:z.string(),sourceChecksum:z.string() });
const nativeCase = z.object({ id:z.string(),boundary:z.string(),identity,initial:object,captured:object,later:object,other:object,
  bodyTemplate:object,view:object,variant:object,siblingIdentity:identity }).passthrough();
const pair = z.object({ access_token:z.string(),refresh_token:z.string() });
const configPath = process.env.FORGE_BROWSER_RECOVERY_CONFIG;
assert(configPath,'Set FORGE_BROWSER_RECOVERY_CONFIG to the root-owned private combined matrix.');
const config = z.object({stage:z.string(),browserOrigin:z.string().url(),apiUrl:z.string().url(),supabaseUrl:z.string().url(),anonKey:z.string(),brandId:z.string(),
  authSession:pair,authSessionB:pair,cases:z.array(actionCase),nativeCases:z.array(nativeCase),nativeConcurrencyCases:z.array(nativeCase).default([]),
  chromeExecutable:z.string().optional() }).parse(JSON.parse(readFileSync(configPath,'utf8')));
for (const url of [config.browserOrigin,config.apiUrl,config.supabaseUrl]) assert.equal(new URL(url).hostname,'127.0.0.1');
const stage=path.resolve(config.stage),decl=JSON.parse(readFileSync(path.join(stage,'run.json'),'utf8'));
assert.equal(decl.maxActualRenders,0);assert.equal(decl.maxInteractiveBrowserContexts??1,1);assert(decl.maxBrowserContexts>=1&&decl.maxBrowserContexts<=2);
assert(decl.prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/'));
const free=()=>{const s=statfsSync(stage);return Number(s.bavail)*Number(s.bsize);};assert(free()>=decl.admissionBytes);
const run=path.join(stage,`browser-recovery-${randomUUID()}`),privateRoot=path.join(run,'private');mkdirSync(privateRoot,{recursive:true,mode:0o700});
const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const source=readFileSync(import.meta.path);writeFileSync(path.join(run,'bench-source.ts'),source,{flag:'wx'});
const observed:Data={startedAt:new Date().toISOString(),sourceSha256:sha(source),cases:[],concurrency:[],wire:[],crashes:[],scope:'Production browser modules and real IndexedDB/network; not application GUI, hosted, rendering or physical gesture proof.'};
const rows=(name:string)=>observed[name] as Data[];
const secretValues=[config.authSession.access_token,config.authSession.refresh_token,config.authSessionB.access_token,config.authSessionB.refresh_token,config.anonKey];
const record=(file:string,value:unknown)=>{assert.equal(path.basename(file),file);const text=JSON.stringify(value,null,2)+'\n';assert(!secretValues.some(secret=>text.includes(secret)),'Private credential refused in public receipt');writeFileSync(path.join(run,file),text,{flag:'wx'});};
const seal=(file:string)=>{const bytes=readFileSync(path.join(run,file));record(file+'.sealed.json',{owner:'aule-forge-versioning',members:[{file,bytes:bytes.length,sha256:sha(bytes)}],closed:true});};
const asData=(value:unknown):Data=>{assert(value&&typeof value==='object'&&!Array.isArray(value));return value as Data;};
const acceptedId=(value:unknown)=>{const v=asData(value);return String(asData(v.revision??v.release??v).id);};
const replacements=(input:Data,result:Data)=>JSON.parse(JSON.stringify(input).replace(/\$acceptedRevisionId/g,String(asData(result.revision??result).id)).replace(/\$acceptedVariantId/g,String(asData(result.revision??result).variantId)).replace(/\$acceptedReleaseId/g,String(asData(result.release??{}).id))) as Data;
const actionName:Record<string,VersioningIntent['action']>={edit_branch:'branch',edit_merge_commit:'merge',edit_revert:'restore',library_release:'release',library_release_rollback:'rollback'};

type Modules={Intent:typeof import('../src/components/forge/versioningIntent').VersioningIntentJournal;
  intentStorage:typeof import('../src/components/forge/versioningIntent').versioningIntentStorage;
  Native:typeof import('../src/components/forge/native/nativeWorkingCopy').NativeWorkingCopy;
  opStorage:typeof import('../src/components/forge/templateOperationJournal').indexedDbOperationJournal;
  sources:typeof import('../src/lib/library/templateSources');hyperframes:typeof import('../src/lib/library/hyperframesNative');edits:typeof import('../src/components/forge/native/nativeEditorEdits');
  nativeIdentity:typeof import('../src/components/forge/native/useNativeWorkingCopy').nativeIdentity;
  supabase:typeof import('../src/lib/supabase/client');contracts:typeof import('@continuum/contracts')};

function browserMain(m:Modules) {
  const host=window as typeof window&{recovery:Record<string,(...args:never[])=>unknown>;report:(value:unknown)=>Promise<void>};
  let fixture:typeof config;let principal='';let arm='';let target='';let kind='';let fired=false;
  const copies=new Map<string,import('../src/components/forge/native/nativeWorkingCopy').NativeWorkingCopy<Data>>();
  let cancelHold:(()=>void)|undefined;
  const hold=()=>new Promise<never>((_resolve,reject)=>{cancelHold=()=>reject(Error('Unsent retained request explicitly stopped by the qualification caller.'));});
  const report=(value:unknown)=>host.report(value);
  let writePhase={key:'',phase:''};
  const classify=(before:Data,after:Data,key:string)=>{
    if(key!==target)return '';
    if(kind==='action') {
      const old=(before.attempts??[]) as VersioningIntent[],next=(after.attempts??[]) as VersioningIntent[];
      if(next.some(value=>value.state==='pending'&&!old.some(prior=>prior.id===value.id)))return 'capture';
      if(old.some(value=>value.state==='pending'&&next.some(prior=>prior.id===value.id&&prior.state==='acknowledged')))return 'ack';
      return '';
    }
    const old=before.projection as NativeCopyState<Data>|undefined,next=after.projection as NativeCopyState<Data>|undefined;
    if(!old?.pending&&next?.pending)return 'capture';
    if(old?.pending&&!next?.pending&&next?.acceptedSaves?.[old.pending.id]&&!old.acceptedSaves?.[old.pending.id])return 'ack';
    return '';
  };
  const originalPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey) {
    const request=originalPut.call(this,value,key);
    const phase=String(key)===writePhase.key?writePhase.phase:'';writePhase={key:'',phase:''};
    if(!fired&&arm===`${phase}-before-commit`) {
      fired=true;const store=this;
      request.addEventListener('success',()=>{
        // Keep this real transaction active with reads until its exact owned Chrome process dies.
        const keep=()=>{const ping=store.get(key!);ping.onsuccess=keep;};keep();
        void report({type:'fault',boundary:arm,proposed:value,transaction:'real IndexedDB put succeeded; transaction still uncommitted'});
      });
    }
    return request;
  };
  function instrument<T extends {change:(...args:never[])=>unknown}>(storage:T):T {
    return {...storage,async change(key:string,update:(record:Data)=>unknown) {
      let phase='';
      const result=await (storage.change as unknown as (key:string,update:(value:Data)=>unknown)=>Promise<unknown>)(key,row=>{const before=structuredClone(row);const result=update(row);phase=classify(before,row,key);writePhase={key,phase};return result;});
      if(!fired&&arm===`${phase}-after-commit`){fired=true;await report({type:'fault',boundary:arm,transaction:'production storage promise resolved after real transaction commit'});await hold();}
      return result;
    }} as unknown as T;
  }
  const originalFetch=window.fetch.bind(window);
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('External network refused by browser-module qualification.');
    const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    const mutation=method==='POST'&&url.pathname===target;
    if(mutation&&!fired&&arm==='send-before-http'){fired=true;await report({type:'fault',boundary:arm});await hold();}
    const response=await originalFetch(input,init);
    if(mutation&&!fired&&arm==='send-after-http'){fired=true;await report({type:'fault',boundary:arm,status:response.status,body:await response.clone().json()});await hold();}
    return response;
  }) as typeof window.fetch;
  async function login(which:'a'|'b') {
    const pair=which==='a'?fixture.authSession:fixture.authSessionB;
    const client=m.supabase.createSupabaseBrowserClient();
    const result=await client.auth.setSession(pair);if(result.error||!result.data.session)throw result.error??Error('Missing genuine session');
    if(result.data.session.access_token!==pair.access_token||result.data.session.refresh_token!==pair.refresh_token)throw Error('Unexpected session refresh');
    const user=await client.auth.getUser();if(user.error||!user.data.user)throw user.error??Error('Genuine principal missing');
    principal=user.data.user.id;return principal;
  }
  async function dispatch(intent:VersioningIntent) {
    if(principal!==intent.userId||await m.sources.fetchTemplateAuthoringUserId()!==intent.userId)throw Error('This frozen intent belongs to another account.');
    const body={...intent.body,brandId:intent.brandId,idempotencyKey:intent.id};
    switch(intent.action) {
      case 'branch':return m.sources.branchTemplateVersion(intent.assetId,m.contracts.templateVersionBranchRequestSchema.parse(body),intent.userId);
      case 'merge':return m.sources.commitTemplateMerge(intent.assetId,m.contracts.templateVersionMergeCommitRequestSchema.parse(body),intent.userId);
      case 'restore':return m.sources.revertTemplateVersion(intent.assetId,m.contracts.templateVersionRevertRequestSchema.parse(body),intent.userId);
      case 'release':return m.sources.promoteTemplateRelease(intent.assetId,m.contracts.templateReleaseRequestSchema.parse(body),intent.userId);
      case 'rollback':return m.sources.rollbackTemplateRelease(intent.assetId,m.contracts.templateReleaseRollbackRequestSchema.parse(body),intent.userId);
    }
  }
  const journal=(assetId:string)=>new m.Intent(principal,fixture.brandId,assetId,instrument(m.intentStorage));
  const initialOwner=(c:z.infer<typeof nativeCase>)=>c.identity.userId;
  async function openNative(c:z.infer<typeof nativeCase>,who=initialOwner(c)) {
    const copy=await m.Native.open<Data>({identity:{...c.identity,userId:who},initial:c.initial,storage:instrument(m.opStorage),
      append:events=>m.sources.appendTemplateAuthoringHistory(who,c.identity.templateId,c.identity.brandId,events)});
    copies.set(c.id,copy);return copy;
  }
  function build(c:z.infer<typeof nativeCase>,base:NativeCopyIdentity,snapshot:Data,key:string):Data {
    if(base.family==='hyperframes')return m.edits.nativeSaveRequest(c.view as unknown as Parameters<Modules['edits']['nativeSaveRequest']>[0],
      c.variant as unknown as Parameters<Modules['edits']['nativeSaveRequest']>[1],snapshot as unknown as Parameters<Modules['edits']['nativeSaveRequest']>[2],key);
    return m.contracts.saveTemplateRevisionRequestSchema.parse({brandId:base.brandId,parentRevisionId:base.baseRevisionId,expectedHeadRevisionId:base.baseRevisionId,
      variantId:base.variantId,idempotencyKey:key,edits:{blender:snapshot},origin:{tool:'Forge scene editor',button:'Save native revision'}});
  }
  async function sendNative(intent:import('../src/components/forge/native/nativeWorkingCopy').NativeSaveIntent<Data>) {
    if(intent.base.family==='hyperframes')return m.hyperframes.saveNativeHyperframesRevision(intent.assetId,m.contracts.saveHyperframesRevisionRequestSchema.parse(intent.body),undefined,intent.userId);
    return m.sources.savePinnedTemplateRevision(intent.assetId,m.contracts.saveTemplateRevisionRequestSchema.parse(intent.body),intent.userId);
  }
  async function saveNative(c:z.infer<typeof nativeCase>) {
    const copy=copies.get(c.id)??await openNative(c);let revision:unknown;
    const result=await copy.save((base,snapshot,key)=>build(c,base,snapshot,key),async intent=>{const saved=await sendNative(intent);revision=saved;
      return m.nativeIdentity(intent.userId,intent.base.brandId,intent.base.family,saved);},m.sources.fetchTemplateAuthoringUserId);
    return {...result,revision};
  }
  const nativeKey=(c:z.infer<typeof nativeCase>)=>`native-editor:${c.identity.userId}:${c.identity.brandId}:${c.identity.templateId}:${c.identity.family}:${c.identity.variantId}`;
  host.recovery={
    async init(value:typeof config){fixture=value;return login('a');},login,
    async arm(value:{boundary:string;storageKey:string;path:string;kind:string}){arm=value.boundary;kind=value.kind;target=/^(send-|sigkill)/.test(arm)?value.path:value.storageKey;fired=false;},
    async disarm(){arm='';fired=false;},
    async cancelHeldSend(){cancelHold?.();cancelHold=undefined;},
    async action(c:z.infer<typeof actionCase>,action:VersioningIntent['action'],input:Data){const j=journal(String(c.input.assetId));const {assetId:_asset,idempotencyKey:_key,...body}=input;
      let intent=await j.pending();if(!intent){const reviewed=structuredClone(body);const capturing=j.capture(String(c.input.assetId),action,body);body.afterInvocationMutation=true;intent=await capturing;
        if(JSON.stringify(intent.body)!==JSON.stringify(reviewed))throw Error('Caller mutation changed the reviewed frozen intent.');}
      const result=await dispatch(intent);await j.finish(intent.id,'acknowledged');return {intent,result};},
    async actionRecord(assetId:string){return m.intentStorage.change(journal(assetId).key,row=>structuredClone(row));},
    async actionFinish(assetId:string,id:string){await journal(assetId).finish(id,'acknowledged');},
    async actionCapture(assetId:string,action:VersioningIntent['action'],input:Data){return journal(assetId).capture(assetId,action,input);},
    async actionDispatch(intent:VersioningIntent){return dispatch(intent);},
    async actionDismiss(assetId:string,id:string){await journal(assetId).finish(id,'dismissed');},
    async nativePrepare(c:z.infer<typeof nativeCase>){const copy=await openNative(c);await copy.edit(c.captured,{command:'forge_native_edit',origin:{control:String(c.fieldId),tool:'Forge browser-module qualification'}});await copy.flush();return copy.read();},
    async nativeRead(c:z.infer<typeof nativeCase>){const copy=copies.get(c.id)??await openNative(c);return copy.read();},
    async nativeFlush(c:z.infer<typeof nativeCase>){await (copies.get(c.id)??await openNative(c)).flush();},
    async nativeOther(c:z.infer<typeof nativeCase>){const copy=copies.get(c.id)??await openNative(c);await copy.edit(c.other,{command:'forge_native_edit',origin:{control:String(c.fieldId),tool:'Forge browser-module qualification'}});await copy.flush();return copy.read();},
    async nativeContext(c:z.infer<typeof nativeCase>,accepted:import('@continuum/contracts').TemplateRevision,initial:Data){const variants=await m.sources.fetchTemplateRevisionVariants(c.identity.brandId,c.identity.templateId);const variant=variants.find(v=>v.variantId===accepted.variantId);if(!variant)throw Error('Accepted branch missing');
      const next={...c,identity:m.nativeIdentity(principal,c.identity.brandId,c.identity.family,accepted),initial,variant};
      if(c.identity.family==='hyperframes')next.view=await m.hyperframes.fetchNativeHyperframesScene(c.identity.brandId,c.identity.templateId,accepted.id) as unknown as Data;return next;},
    async nativeLate(c:z.infer<typeof nativeCase>){const copy=copies.get(c.id)??await openNative(c);await copy.edit(c.later,{command:'forge_native_edit',origin:{control:String(c.fieldId),tool:'Forge browser-module qualification'}});await copy.flush();return copy.read();},
    async nativeSibling(c:z.infer<typeof nativeCase>){const sibling=await openNative({...c,id:c.id+':sibling',identity:c.siblingIdentity});const before=await sibling.read();
      if(JSON.stringify(before.history.present)===JSON.stringify(before.history.baseline)){await sibling.edit(c.other,{command:'forge_native_edit',origin:{control:'Sibling',tool:'Forge browser-module qualification'}});await sibling.flush();}return sibling.read();},
    nativeSave:saveNative,
    async nativeDispatch(intent:import('../src/components/forge/native/nativeWorkingCopy').NativeSaveIntent<Data>){return sendNative(intent);},
    async nativeChanged(c:z.infer<typeof nativeCase>,intent:import('../src/components/forge/native/nativeWorkingCopy').NativeSaveIntent<Data>){return sendNative({...intent,body:build(c,intent.base,c.other,intent.id)});},
    async nativePrincipalRead(c:z.infer<typeof nativeCase>){return (await openNative({...c,id:c.id+':principal'},principal)).read();},
    async nativeRaw(c:z.infer<typeof nativeCase>){return m.opStorage.change(nativeKey(c),row=>structuredClone(row));},
    async nativeDismiss(c:z.infer<typeof nativeCase>){return (copies.get(c.id)??await openNative(c)).dismissSave({button:'Stop unsent qualification retry'});},
    async catalog(assetId:string){return m.sources.fetchTemplateRevisionVariants(fixture.brandId,assetId);},
    async releases(assetId:string){return m.sources.fetchTemplateReleases(fixture.brandId,assetId);},
    async history(assetId:string){return m.sources.fetchTemplateVersionHistory(fixture.brandId,assetId,{limit:500});},
    async commits(assetId:string){return m.sources.fetchTemplateVersionCommits(fixture.brandId,assetId);},
    async nativeAdvance(c:z.infer<typeof nativeCase>,accepted:import('@continuum/contracts').TemplateRevision){
      const who=await login('b');const variants=await m.sources.fetchTemplateRevisionVariants(c.identity.brandId,c.identity.templateId);
      const variant=variants.find(v=>v.variantId===accepted.variantId);if(!variant)throw Error('Accepted native branch missing');
      const next={...c,id:c.id+':advance',identity:m.nativeIdentity(who,c.identity.brandId,c.identity.family,accepted),initial:c.captured,variant};
      if(c.identity.family==='hyperframes')next.view=await m.hyperframes.fetchNativeHyperframesScene(c.identity.brandId,c.identity.templateId,accepted.id) as unknown as Data;
      const copy=await openNative(next,who);await copy.edit(c.other,{command:'forge_native_edit',origin:{control:'Head advance',tool:'Forge browser-module qualification'}});await copy.flush();
      const saved=await saveNative(next);await login('a');return saved;
    },
  } as unknown as typeof host.recovery;
}

const frontend=path.resolve(import.meta.dir,'..');
const imports=[['Intent','src/components/forge/versioningIntent.ts','VersioningIntentJournal'],['intentStorage','src/components/forge/versioningIntent.ts','versioningIntentStorage'],
  ['Native','src/components/forge/native/nativeWorkingCopy.ts','NativeWorkingCopy'],['opStorage','src/components/forge/templateOperationJournal.ts','indexedDbOperationJournal'],
  ['nativeIdentity','src/components/forge/native/useNativeWorkingCopy.ts','nativeIdentity']].map(([name,file,member])=>`import { ${member} as ${name} } from ${JSON.stringify(path.join(frontend,file!))};`).join('\n');
const namespaces=[['sources','src/lib/library/templateSources.ts'],['supabase','src/lib/supabase/client.ts'],['edits','src/components/forge/native/nativeEditorEdits.ts'],['hyperframes','src/lib/library/hyperframesNative.ts']]
  .map(([name,file])=>`import * as ${name} from ${JSON.stringify(path.join(frontend,file!))};`).join('\n');
const entry=path.join(privateRoot,'entry.ts');writeFileSync(entry,`${imports}\n${namespaces}\nimport * as contracts from ${JSON.stringify(Bun.resolveSync('@continuum/contracts',frontend))};\n(${browserMain.toString()})({Intent,intentStorage,Native,opStorage,nativeIdentity,sources,supabase,edits,hyperframes,contracts});`);
const build=await Bun.build({entrypoints:[entry],target:'browser',format:'esm',minify:false,define:{
  'process.env.NODE_ENV':JSON.stringify('test'),'process.env.NEXT_PUBLIC_API_URL':JSON.stringify(config.apiUrl),
  'process.env.NEXT_PUBLIC_SUPABASE_URL':JSON.stringify(config.supabaseUrl),'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':JSON.stringify(config.anonKey),
  'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY':'undefined','process.env.NEXT_PUBLIC_API_BASE_URL':'undefined',
  'process.env.API_URL':'undefined','process.env.API_BASE_URL':'undefined'},plugins:[{name:'frontend-alias',setup(builder){builder.onResolve({filter:/^@\//},args=>({path:Bun.resolveSync(path.join(frontend,'src',args.path.slice(2)),frontend)}));}}]});
assert(build.success,build.logs.map(String).join('\n'));const bundle=await build.outputs[0]!.text();writeFileSync(path.join(privateRoot,'bundle.js'),bundle);observed.bundleSha256=sha(bundle);
if(process.env.FORGE_BROWSER_PREPARE_ONLY==='1'){record('prepared.json',{sourceSha256:sha(source),bundleSha256:sha(bundle),configSchema:'root combined matrix:35 actions,14 native faults,2 dedicated native concurrency cases',actionCases:config.cases.length,nativeCases:config.nativeCases.length,nativeConcurrencyCases:config.nativeConcurrencyCases.length,privateBundleRetained:true,noBrowserOrServiceStarted:true});console.log(JSON.stringify({prepared:run}));process.exit(0);}

let context:BrowserContext|undefined;let pages:Page[]=[];let fault:Data|null=null;let activePath='';let currentCase:Data={};let late:()=>Promise<void>=async()=>{};let lateDone=false;
let holdResponses=false;let holdIntentKey='';let held:Array<{pageIndex:number;release:()=>Promise<void>}>=[];let profileIdentity:Data|null=null;
const profile=path.join(privateRoot,'chrome-profile');
const launchDriver=processIdentity(process.pid);
const server=Bun.serve({hostname:'127.0.0.1',port:Number(new URL(config.browserOrigin).port),fetch(request){const url=new URL(request.url);return url.pathname==='/bundle.js'?new Response(bundle,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Forge production module recovery</title><script type="module" src="/bundle.js"></script>',{headers:{'content-type':'text/html; charset=utf-8'}});}});
const call=(page:Page,method:string,...args:unknown[])=>page.evaluate(async({method,args})=>{const api=(window as unknown as {recovery:Record<string,(...args:unknown[])=>unknown>}).recovery;return api[method]!(...args);},{method,args});
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,label:string,seconds=90){const end=Date.now()+seconds*1000;for(;;){const value=await read();if(accept(value))return value;assert(Date.now()<end,`Timed out: ${label}`);await new Promise(r=>setTimeout(r,25));}}
function processIdentity(pid:number){const directory=`/proc/${pid}`;const stat=readFileSync(`${directory}/stat`,'utf8').split(') ')[1]!.split(' ');return {pid,uid:statSync(directory).uid,parentPid:Number(stat[1]),startTicks:stat[19],executable:readlinkSync(`${directory}/exe`)};}
async function chromeIdentity(){
 const deadline=Date.now()+15_000;let children:Data[]=[];
 for(;;){const found=[];children=[];
  for(const name of readdirSync('/proc').filter(v=>/^\d+$/.test(v)))try{
   const directory=`/proc/${name}`;if(statSync(directory).uid!==process.getuid!())continue;
   const fields=readFileSync(`${directory}/stat`,'utf8').split(') ')[1]!.split(' ');if(Number(fields[1])!==process.pid)continue;
   const owned=processIdentity(Number(name));assert.equal(owned.uid,process.getuid!());
   const args=readFileSync(`/proc/${owned.pid}/cmdline`).toString('utf8').split('\0');
   // Chrome may flatten argv into its process title; generated profiles have no whitespace.
   assert(!/\s/.test(profile));const tokens=args.flatMap(value=>value.split(/\s+/));
   const index=tokens.indexOf('--user-data-dir');const selected=tokens.find(value=>value.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length)??(index>=0?tokens[index+1]:undefined);
   children.push({...owned,...(/chrome|chromium/.test(path.basename(owned.executable))?{ownedArgv:args}:{})});
   if(selected&&path.resolve(selected)===path.resolve(profile)){assert(/chrome|chromium/.test(path.basename(owned.executable)));found.push(owned);}
  }catch(error){if(!['ENOENT','ESRCH'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
  if(found.length===1)return found[0]!;assert(found.length<2,'Only one exact owned Chrome profile root is allowed');
  if(Date.now()>=deadline){writeFileSync(path.join(privateRoot,`chrome-lookup-${Date.now()}.json`),JSON.stringify({profile,launchDriver,children},null,2));throw Error('Owned Chrome profile was not found; exact owned-child diagnostics retained privately.');}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
}
async function launch(){context=await chromium.launchPersistentContext(profile,{headless:true,...(config.chromeExecutable?{executablePath:config.chromeExecutable}:{})});profileIdentity=await chromeIdentity();assert.equal(profileIdentity.parentPid,process.pid,'Chrome must be directly owned by this Playwright launch driver');
  await context.exposeBinding('report',(_source,value)=>{const row=asData(value);if(row.type==='fault'){fault=row;const file=`fault-${currentCase.id}-${Date.now()}.json`;record(file,{caseId:currentCase.id,...row});seal(file);}});
  await context.route('**/*',async(route:Route)=>{const request=route.request(),url=new URL(request.url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort('blockedbyclient');
    if(url.origin!==new URL(config.apiUrl).origin||request.method()!=='POST')return route.continue();
    const response=await route.fetch();const bytes=await response.body();const body=JSON.parse(bytes.toString());const requestBody=JSON.parse(request.postData()??'{}');
    assert(bytes.length<=8*1024*1024,'Bounded actual API packet');
    const packet:Data={caseId:currentCase.id,path:url.pathname,status:response.status(),request:requestBody,requestSha256:sha(request.postData()??''),requestBodyBase64:Buffer.from(request.postData()??'').toString('base64'),response:body,responseSha256:sha(bytes),responseBodyBase64:bytes.toString('base64')};
    const file=`wire-${String(rows('wire').length+1).padStart(5,'0')}.json`;record(file,packet);seal(file);rows('wire').push(packet);
    if(url.pathname===activePath&&response.ok()){
      if(!lateDone){lateDone=true;await late();}
      if(currentCase.boundary==='sigkill-awaiting-response'&&!currentCase.recovering){fault={type:'fault',boundary:'sigkill-awaiting-response',status:response.status(),body};return new Promise<void>(()=>{});}
      if(holdResponses&&(!holdIntentKey||requestBody.idempotencyKey===holdIntentKey))return new Promise<void>((resolve,reject)=>held.push({pageIndex:pages.indexOf(request.frame().page()),release:async()=>{try{await route.fulfill({response});resolve();}catch(error){reject(error);}}}));
    }
    await route.fulfill({response});
  });
  pages=[await context.newPage(),await context.newPage()];for(const page of pages){page.on('pageerror',error=>writeFileSync(path.join(privateRoot,`bootstrap-error-${randomUUID()}.json`),JSON.stringify({message:error.message,stack:error.stack},null,2),{flag:'wx',mode:0o600}));await page.goto(config.browserOrigin);await page.waitForFunction(()=>!!(window as unknown as {recovery:unknown}).recovery);await call(page,'init',config);}}
async function crash(){assert(context&&profileIdentity);const actual=await chromeIdentity();assert.deepEqual(actual,profileIdentity);const parent=processIdentity(actual.parentPid);assert.deepEqual(parent,launchDriver,'Exact Playwright launch-driver PID/UID/parent/startticks remain unchanged');
  process.kill(actual.pid,'SIGKILL');const receipt={...actual,signal:'SIGKILL',launchDriver:parent,caseId:currentCase.id};rows('crashes').push(receipt);const file=`crash-${String(rows('crashes').length).padStart(3,'0')}.json`;record(file,receipt);seal(file);await context.close().catch(()=>{});context=undefined;held=[];}
const routeFor=(command:string)=>({edit_branch:'branches',edit_merge_commit:'merges',edit_revert:'reverts',library_release:'releases',library_release_rollback:'releases/rollback'}[command]);
async function resolvedInput(c:z.infer<typeof actionCase>){const input=structuredClone(c.input);if(input.expectedReleaseId==='$prepareCurrentReleaseId'){const catalog=asData(await call(pages[0]!,'releases',input.assetId));currentCase.prepareReleaseCatalog=catalog;const head=(catalog.heads as Data[]).find(h=>h.bindingId===input.bindingId&&h.templateKey===input.templateKey);assert(head);input.expectedReleaseId=head.releaseId;}return input;}
function originalIdentity(variant:Data|undefined){assert(variant);return {variantId:variant.variantId,head:variant.draftHeadRevisionId,revisions:(variant.revisions as Data[]).map(r=>({id:r.id,parent:r.parentRevisionId,sourceAssetId:r.sourceAssetId,sourceVersionId:r.sourceVersionId,checksum:r.checksum,edits:r.edits,native:r.native}))};}
async function assertOriginals(snapshot:Data[]){for(const entry of snapshot){const catalog=await call(pages[0]!,'catalog',entry.assetId) as Data[];assert.deepEqual(originalIdentity(catalog.find(v=>v.original)),entry.original);}}
let failed=false;const started=Date.now();
const timer=setInterval(()=>{if(free()<decl.stopFreeBytes||Date.now()-started>20*60_000){failed=true;void context?.close();}},1000);
try{
 await launch();const originals:Data[]=[];for(const asset of new Set([...config.cases.map(c=>String(c.input.assetId)),...config.nativeCases.map(c=>c.identity.templateId)])){const variants=await call(pages[0]!,'catalog',asset) as Data[];originals.push({assetId:asset,original:originalIdentity(variants.find(v=>v.original))});}record('originals-before.json',originals);
 for(const c of config.cases){const row:Data={id:c.id,command:c.command,boundary:c.boundary};currentCase=row;fault=null;activePath=`/api/ai-studio/templates/${c.input.assetId}/${routeFor(c.command)}`;lateDone=false;late=async()=>{};
  try{const input=await resolvedInput(c);row.resolvedInput=input;const owner=String(await call(pages[0]!,'login','a'));const key=`versioning-intents:${owner}:${config.brandId}:${c.input.assetId}`;
   await call(pages[0]!,'arm',{boundary:c.boundary,storageKey:key,path:activePath,kind:'action'});
   const action=actionName[c.command];assert(action);const running=call(pages[0]!,'action',c,action,input).catch(error=>({error:String(error)}));
   await until(async()=>fault,Boolean,'actual action fault');row.fault=fault;
   assert.equal(rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath&&Number(w.status)<300).length>0,!['capture-before-commit','capture-after-commit','send-before-http'].includes(c.boundary),'Fault belongs to this actual mutation phase');await crash();await running;await launch();row.recovering=true;
   const before=asData(await call(pages[0]!,'actionRecord',c.input.assetId));row.beforeRecovery=before;
   assert.equal((before.attempts as VersioningIntent[]).filter(value=>value.state==='pending').length,['capture-before-commit','ack-after-commit'].includes(c.boundary)?0:1,'Real transaction crash boundary determines durable pending state');
   let result:Data;
   if(c.boundary==='ack-after-commit') {
     const packets=rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath&&Number(w.status)<300);assert(packets.length);
     const key=String(asData(packets[0]!.request).idempotencyKey);
     const intent=(before.attempts as VersioningIntent[]).find(value=>value.id===key);assert.equal(intent?.state,'acknowledged');
     result={intent,result:packets[0]!.response};
   } else result=asData(await call(pages[0]!,'action',c,action,input));
   row.accepted=result.result;const intent=result.intent as VersioningIntent;
   // Acknowledged action recovery reads the record rather than creating a fresh command.
   row.afterRecovery=await call(pages[0]!,'actionRecord',c.input.assetId);
   const advance=replacements(c.advance.input,asData(result.result));const advanceAction=actionName[c.advance.command];assert(advanceAction);
   const {assetId:advanceAsset,idempotencyKey:advanceKey,...advanceBody}=advance;
   const advanced=await call(pages[1]!,'actionDispatch',{id:String(advanceKey),userId:owner,brandId:config.brandId,assetId:String(advanceAsset),action:advanceAction,body:advanceBody,createdAt:new Date().toISOString(),state:'pending'});row.advanced=advanced;
   const replay=await call(pages[0]!,'actionDispatch',intent);assert.equal(acceptedId(replay),acceptedId(result.result));row.replay=replay;
   if(asData(result.result).pointerEventId)assert.equal(asData(replay).pointerEventId,asData(result.result).pointerEventId,'Replay retains exactly the same pointer event');
   const siblingIntent=await call(pages[0]!,'actionCapture',c.input.assetId,action,intent.body) as VersioningIntent;
   await call(pages[1]!,'actionFinish',c.input.assetId,intent.id);
   const preserved=asData(await call(pages[0]!,'actionRecord',c.input.assetId));assert((preserved.attempts as VersioningIntent[]).some(value=>value.id===siblingIntent.id&&value.state==='pending'));
   const packetsBeforeOwner=rows('wire').filter(w=>w.path===activePath).length;await call(pages[0]!,'login','b');let ownerRefusal='';
   try{await call(pages[0]!,'actionDispatch',intent);}catch(error){ownerRefusal=String(error);}assert(ownerRefusal);assert.equal(rows('wire').filter(w=>w.path===activePath).length,packetsBeforeOwner);row.accountRefusal=ownerRefusal;await call(pages[0]!,'login','a');
   const changed=structuredClone(intent);if(action==='branch')changed.body.name=String(changed.body.name)+' changed';else if(action==='release')changed.body.revisionId=c.advance.input.revisionId;else if(action==='rollback')changed.body.releaseId=input.expectedReleaseId;else changed.body.message='Changed reviewed business intent';
   const beforeChanged=rows('wire').length;let changedRefusal='';try{await call(pages[0]!,'actionDispatch',changed);}catch(error){changedRefusal=String(error);}assert(changedRefusal);const changedPackets=rows('wire').slice(beforeChanged).filter(w=>w.path===activePath);assert.equal(changedPackets.at(-1)?.status,409);row.changedIntentRefusal=changedRefusal;
   await call(pages[0]!,'actionDismiss',c.input.assetId,siblingIntent.id);
   if(asData(result.result).pointerEventId){const history=asData(await call(pages[0]!,'history',c.input.assetId));assert.equal((history.items as Data[]).filter(e=>e.id===asData(result.result).pointerEventId).length,1);}
   else{const commits=asData(await call(pages[0]!,'commits',c.input.assetId));assert.equal((commits.items as Data[]).filter(e=>e.revisionId===acceptedId(result.result)).length,1);}
   await assertOriginals(originals);row.pass=true;
  }catch(error){row.pass=false;row.error=String(error);failed=true;}rows('cases').push(row);record(`${c.id}.json`,{...row,wire:rows('wire').filter(packet=>packet.caseId===c.id),crashes:rows('crashes').filter(crash=>crash.caseId===c.id)});seal(`${c.id}.json`);if(failed)break;
 }
 if(!failed)for(const c of config.nativeCases){const row:Data={id:c.id,family:c.identity.family,boundary:c.boundary};currentCase=row;fault=null;activePath=`/api/ai-studio/templates/${c.identity.templateId}/revisions`;lateDone=false;
  try{const sibling=await call(pages[0]!,'nativeSibling',c);row.siblingBefore=sibling;await call(pages[0]!,'nativePrepare',c);
   late=async()=>{await call(pages[1]!,'nativeLate',c);};const key=`native-editor:${c.identity.userId}:${c.identity.brandId}:${c.identity.templateId}:${c.identity.family}:${c.identity.variantId}`;
   await call(pages[0]!,'arm',{boundary:c.boundary,storageKey:key,path:activePath,kind:'native'});const running=call(pages[0]!,'nativeSave',c).catch(error=>({error:String(error)}));
   await until(async()=>fault,Boolean,'actual native fault');row.fault=fault;
   assert.equal(rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath&&Number(w.status)<300).length>0,!['capture-before-commit','capture-after-commit','send-before-http'].includes(c.boundary),'Native fault belongs to this actual send/ack phase');await crash();await running;await launch();row.recovering=true;
   const before=asData(await call(pages[0]!,'nativeRead',c));row.beforeRecovery=before;
   assert.equal(!!before.pending,!['capture-before-commit','ack-after-commit'].includes(c.boundary),'Real native capture/ack transaction boundary');
   let accepted:unknown;let frozen:unknown=before.pending;
   if(before.pending){const replay=asData(await call(pages[0]!,'nativeSave',c));accepted=replay.revision;}
   else if(c.boundary==='ack-after-commit'){const packets=rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath&&Number(w.status)<300);assert(packets.length);accepted=packets[0]!.response;}
   else {const replay=asData(await call(pages[0]!,'nativeSave',c));accepted=replay.revision;const events=asData(await call(pages[0]!,'nativeRaw',c)).events as Data[];frozen=(events.find(e=>e.command==='forge_native_save'&&e.outcome==='requested')?.changes as Data)?.body;}
   const originalPacket=rows('wire').find(w=>w.caseId===c.id&&w.path===activePath&&Number(w.status)<300);assert(originalPacket);
   frozen={id:String(asData(originalPacket.request).idempotencyKey),userId:c.identity.userId,assetId:c.identity.templateId,body:originalPacket.request,base:c.identity,snapshot:c.captured,throughSequence:0};
   row.frozenIntent=frozen;row.accepted=accepted;row.afterRecovery=await call(pages[0]!,'nativeRead',c);
   const state=asData(row.afterRecovery);assert.equal(state.pending,null);assert.deepEqual(asData(state.history).present,c.later);assert.deepEqual(asData(state.history).baseline,c.captured);
   assert.deepEqual(await call(pages[0]!,'nativeSibling',c),sibling);row.advanced=await call(pages[1]!,'nativeAdvance',c,accepted);
   if(frozen&&asData(frozen).body){const replay=await call(pages[0]!,'nativeDispatch',frozen);assert.equal(acceptedId(replay),acceptedId(accepted));row.replay=replay;}
   const beforeOwner=rows('wire').filter(w=>w.path===activePath).length;await call(pages[0]!,'login','b');let ownerRefusal='';try{await call(pages[0]!,'nativeSave',c);}catch(error){ownerRefusal=String(error);}assert(ownerRefusal);assert.equal(rows('wire').filter(w=>w.path===activePath).length,beforeOwner);
   const otherAccount=asData(await call(pages[0]!,'nativePrincipalRead',c));assert.equal(otherAccount.pending,null);assert.notEqual(otherAccount.workingCopyId,state.workingCopyId);row.accountRefusal=ownerRefusal;await call(pages[0]!,'login','a');
   const beforeChanged=rows('wire').length;let changedRefusal='';try{await call(pages[0]!,'nativeChanged',c,frozen);}catch(error){changedRefusal=String(error);}assert(changedRefusal);assert.equal(rows('wire').slice(beforeChanged).filter(w=>w.path===activePath).at(-1)?.status,409);row.changedIntentRefusal=changedRefusal;
   const commits=asData(await call(pages[0]!,'commits',c.identity.templateId));assert.equal((commits.items as Data[]).filter(e=>e.revisionId===acceptedId(accepted)).length,1);
   await assertOriginals(originals);row.pass=true;
  }catch(error){row.pass=false;row.error=String(error);failed=true;}rows('cases').push(row);record(`${c.id}.json`,{...row,wire:rows('wire').filter(packet=>packet.caseId===c.id),crashes:rows('crashes').filter(crash=>crash.caseId===c.id)});seal(`${c.id}.json`);if(failed)break;
 }
 if(!failed)for(const c of config.nativeConcurrencyCases){
  const row:Data={id:c.id,family:c.identity.family,boundary:'concurrency'};currentCase=row;fault=null;activePath=`/api/ai-studio/templates/${c.identity.templateId}/revisions`;lateDone=true;late=async()=>{};held=[];holdIntentKey='';holdResponses=true;
  try{
   const sibling=await call(pages[0]!,'nativeSibling',c);await call(pages[0]!,'nativePrepare',c);await call(pages[1]!,'nativeRead',c);
   const first=call(pages[0]!,'nativeSave',c).catch(error=>({error:String(error)})),duplicate=call(pages[1]!,'nativeSave',c).catch(error=>({error:String(error)}));
   await until(async()=>held.length,count=>count===2,'both genuine native responses held for the same frozen request');
   const packets=rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath&&Number(w.status)<300);assert.equal(packets.length,2);assert.equal(packets[0]!.requestSha256,packets[1]!.requestSha256);assert.equal(acceptedId(packets[0]!.response),acceptedId(packets[1]!.response));
   holdIntentKey=String(asData(packets[0]!.request).idempotencyKey);const primary=held.find(value=>value.pageIndex===0);assert(primary);held=held.filter(value=>value!==primary);await primary.release();const firstResult=asData(await first);assert(!firstResult.error,String(firstResult.error));row.first=firstResult;
   const beforeClean=rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath).length;let cleanRefusal='';try{await call(pages[0]!,'nativeSave',c);}catch(error){cleanRefusal=String(error);}assert.match(cleanRefusal,/unsaved/);assert.equal(rows('wire').filter(w=>w.caseId===c.id&&w.path===activePath).length,beforeClean);row.cleanRefusal=cleanRefusal;
   const next=await call(pages[0]!,'nativeContext',c,firstResult.revision,c.captured) as z.infer<typeof nativeCase>;await call(pages[0]!,'nativeLate',next);const second=asData(await call(pages[0]!,'nativeSave',next));row.second=second;
   const latest=await call(pages[0]!,'nativeContext',next,second.revision,c.later) as z.infer<typeof nativeCase>;await call(pages[0]!,'nativeOther',latest);
   fault=null;await call(pages[0]!,'arm',{boundary:'send-before-http',storageKey:'',path:activePath,kind:'native'});
   const unsent=call(pages[0]!,'nativeSave',latest).catch(error=>({error:String(error)}));await until(async()=>fault,Boolean,'newer intent captured and held before any HTTP');
   const newer=asData(await call(pages[0]!,'nativeRead',latest));assert(newer.pending);const oldDuplicate=held.find(value=>value.pageIndex===1);assert(oldDuplicate);held=held.filter(value=>value!==oldDuplicate);await oldDuplicate.release();const duplicateResult=asData(await duplicate);assert(!duplicateResult.error,String(duplicateResult.error));row.duplicate=duplicateResult;
   const preserved=asData(await call(pages[0]!,'nativeRead',latest));assert.deepEqual(preserved.pending,newer.pending);assert.equal(asData(preserved.base).baseRevisionId,acceptedId(second.revision));assert.deepEqual(asData(preserved.history).present,c.other);assert.deepEqual(asData(preserved.history).baseline,c.later);row.preserved=preserved;
   const raw=asData(await call(pages[0]!,'nativeRaw',latest));const succeeded=(raw.events as Data[]).filter(event=>event.command==='forge_native_save'&&event.outcome==='succeeded');assert.equal(succeeded.length,2);assert.equal(succeeded.filter(event=>asData(event.changes).intentId===holdIntentKey).length,1);row.succeededEvidence=succeeded;
   await call(pages[0]!,'nativeDismiss',latest);await call(pages[0]!,'disarm');await call(pages[0]!,'cancelHeldSend');assert(asData(await unsent).error);await call(pages[0]!,'nativeFlush',latest);await call(pages[1]!,'nativeFlush',c);
   assert.deepEqual(await call(pages[0]!,'nativeSibling',c),sibling);await assertOriginals(originals);row.pass=true;
  }catch(error){row.pass=false;row.error=String(error);failed=true;}
  finally{holdResponses=false;holdIntentKey='';}
  rows('concurrency').push(row);record(`${c.id}.json`,{...row,wire:rows('wire').filter(packet=>packet.caseId===c.id),crashes:rows('crashes').filter(crash=>crash.caseId===c.id)});seal(`${c.id}.json`);if(failed)break;
 }
}catch(error){failed=true;observed.failure={message:String(error),stack:error instanceof Error?error.stack:undefined,cause:error instanceof Error?String(error.cause??''):undefined};}
finally{clearInterval(timer);await context?.close().catch(()=>{});server.stop(true);observed.finishedAt=new Date().toISOString();observed.passed=rows('cases').filter(c=>c.pass).length;observed.failed=rows('cases').filter(c=>!c.pass).length;observed.concurrencyPassed=rows('concurrency').filter(c=>c.pass).length;observed.expectedFaultCases=config.cases.length+config.nativeCases.length;observed.expectedConcurrencyCases=config.nativeConcurrencyCases.length;observed.unrun=[...config.cases,...config.nativeCases,...config.nativeConcurrencyCases].map(c=>c.id).filter(id=>![...rows('cases'),...rows('concurrency')].some(c=>c.id===id));record('observed.json',observed);seal('observed.json');console.log(JSON.stringify({run,failed,passed:observed.passed,failedCases:observed.failed}));}
process.exitCode=failed?1:0;
