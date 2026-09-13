import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";

// Exercise the real router, canonical shell, Paper block and ticket. Only I/O and
// unrelated child views are replaced; no order reaches an execution adapter.
const io: any = {
  workspace: "paper", backend: "nautilus", availability: "AVAILABLE",
  session: null, settings: undefined, refresh: async () => {}, queryClient: {},
};
const mocks: Record<string, string> = {
  "@/lib/executionWorkspace": `export const getExecutionWorkspace=()=>io.workspace; export const subscribeExecutionWorkspace=()=>()=>{};`,
  "@/lib/paperState": `export const usePaperState=()=>({backend:io.backend, availability:io.availability, active:true, resources:{account:io.availability,position:io.availability}, settings:io.settings, orders:[], trades:[], position:null, account:{equityUsdt:10000,availableMarginUsdt:10000},refresh:io.refresh}); export const isPaperExecutionCoreReady=s=>s.active&&s.resources.account==='AVAILABLE'&&s.resources.position==='AVAILABLE';`,
  "@tanstack/react-query": `export class QueryClient {} export const useQueryClient=()=>io.queryClient; export const useQuery=()=>({data:undefined});`,
  "./CanonicalNetPnlCard": `export const CanonicalNetPnlCard=()=>null;`,
  "./ExchangeConnectionPanel": `export const ExchangeConnectionPanel=()=>null;`,
  "@/components/common/TerminalErrorBoundary": `export const TerminalErrorBoundary=({children})=>children;`,
  "./BingXExecutionPanel": `import React from 'react'; export function BingXExecutionPanel(){return React.createElement('div',{'data-execution-workspace':'bingx'});}`,
  "../TerminalPanel": `import React from 'react'; export function TerminalPanel({children,headerExtra,...props}){return React.createElement('section',props,headerExtra,children);}`,
  "./PaperPositionsOrdersSection": `import React from 'react'; export function PaperPositionsOrdersSection(){return React.createElement('section',{'data-position-management':true});}`,
  "./BingXReferenceAccountStrip": `export const BingXReferenceAccountStrip=()=>null;`,
  "@/lib/desktopRuntime": `export const isTauriRuntime=()=>false;`,
  "@/lib/nautilusPaperDevControl": `export const createNautilusPaperDevControl=()=>({status:()=>({availability:io.availability})});`,
  "@/lib/nautilusSimulationBridge": `export const nautilusSimulation={};`,
  "@/lib/paperExecutionPort": `export const paperExecutionPort={getBackend:()=>io.backend,getState:()=>({availability:io.availability,engine:'RUNNING',simulation:'RUNNING'}),previewOrder:async()=>({})};export const setPaperExecutionBackend=b=>{io.backend=b};export class PaperExecutionPortError extends Error {}`,
  "../health/terminalAuditLog": `export const emitTerminalAudit=()=>{};`,
  "./paperQueryKeys": `export const invalidatePaperQueries=async()=>{};`,
  "./paperApiClient": `export const paperApiFetch=()=>{throw Error('Unexpected API call')};`,
  "./bingxApiClient": `export const bingxApiFetch=()=>{throw Error('Broker must not run in Paper')};`,
};
const bundle = await build({
  entryPoints:["client/src/components/terminal/execution/TradingExecutionPanel.tsx"],
  bundle:true, write:false, platform:"node", format:"cjs", jsx:"automatic",
  external:["react","react/jsx-runtime"], define:{"import.meta.env":"{}"},
  plugins:[{name:"isolated-io",setup(b){
    b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:"mock"}:undefined);
    b.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:mocks[a.path],loader:"js"}));
  }}],
});
const module = {exports:{} as any};
runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),io,console,setTimeout,clearTimeout,URLSearchParams});
const {TradingExecutionPanel}=module.exports;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

test("single Paper component and real ticket survive every availability/backend transition with safe drafts",async()=>{
  let renderer:any;
  await act(async()=>{renderer=create(React.createElement(TradingExecutionPanel));});
  const root=()=>renderer.root;
  const component=(name:string)=>root().findAll((n:any)=>typeof n.type==='function'&&n.type.name===name)[0];
  const original=component('PaperExecutionPanel');
  const ticket=component('PaperOrderTicket');
  const button=(label:string)=>root().findAllByType('button').find((n:any)=>n.children.join('').toLowerCase()===label);
  await act(async()=>{button('short').props.onClick();button('limit').props.onClick();});
  const qty=()=>root().findByProps({title:'Edit to recalculate Size USDT'});
  const leverage=()=>root().findAllByType('input').find((n:any)=>n.props.min===1);
  await act(async()=>{
    qty().props.onChange({target:{value:'0.00123'}});
    leverage().props.onChange({target:{value:'7'}});
    root().findByType('select').props.onChange({target:{value:'cross'}});
    root().findByProps({placeholder:'Required for limit'}).props.onChange({target:{value:'50000'}});
  });
  for(const backend of ['nautilus','legacy']){
    for(const availability of ['DISCONNECTED','STARTING','CONNECTING','NOT_WIRED','PARTIAL','AVAILABLE','UNAVAILABLE','ERROR','AVAILABLE']){
      io.backend=backend;io.availability=availability;
      io.settings={defaultLeverage:10,defaultMarginMode:'isolated'};
      for(const session of [null,{connected:false},{connected:true}]){
        io.session=session;
        await act(async()=>renderer.update(React.createElement(TradingExecutionPanel)));
        assert.equal(component('PaperExecutionPanel'),original,`${backend}/${availability}: shell identity`);
        assert.equal(component('PaperOrderTicket'),ticket,`${backend}/${availability}: ticket identity`);
        assert.equal(root().findAll(n=>typeof n.type==='string'&&n.props['data-execution-workspace']).length,1);
        assert.equal(qty().props.value,'0.00123');
        assert.equal(leverage().props.value,'7');
        assert.equal(root().findByType('select').props.value,'cross');
        assert.equal(root().findByProps({placeholder:'Required for limit'}).props.value,'50000');
        assert.equal(ticket.props.executionUnavailable,availability!=='AVAILABLE');
        assert.match(button('short').props.className,/border-red/);
        assert.match(button('limit').props.className,/border-cyan/);
        if(availability!=='AVAILABLE') {
          for(const label of ['buy market','sell market','place buy limit','place sell limit','close position','cancel all paper orders']) assert.equal(button(label).props.disabled,true,label);
        }
        const text=JSON.stringify(renderer.toJSON());
        assert.doesNotMatch(text,/Connect BingX|Broker login|required login|Live locked|LIVE TRADING LOCKED/);
      }
    }
  }
  io.workspace='bingx';
  await act(async()=>renderer.update(React.createElement(TradingExecutionPanel)));
  assert.equal(component('PaperExecutionPanel'),original);
  assert.equal(component('PaperOrderTicket'),ticket);
  assert.equal(qty().props.value,'0.00123');
  assert.equal(ticket.props.executionUnavailable,true);
  assert.equal(root().findAll(n=>typeof n.type==='string'&&n.props['data-execution-workspace']).length,1);
  assert.equal(root().findByProps({'data-execution-workspace':'bingx'}).type,'div');
  await act(async()=>renderer.unmount());
});
