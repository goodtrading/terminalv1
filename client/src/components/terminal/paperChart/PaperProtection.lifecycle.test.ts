import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { transform } from 'esbuild';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { reconcileProtectivePriceLines } from './protectivePriceLines';
import { calculateNetPositionPct } from '../execution/canonicalNetPnl';
const file = readFileSync('client/src/components/terminal/paperChart/PaperTradeOverlay.tsx','utf8');
const ast = ts.createSourceFile('overlay.tsx',file,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn = ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='CanonicalProtectionLines')!;
const built = await transform(fn.getText(ast)+'\nexports.Component=CanonicalProtectionLines;', {loader:'tsx',format:'cjs',jsx:'automatic'});
const scope:any = {exports:{}, require:createRequire(import.meta.url), ...React, React, reconcileProtectivePriceLines, calculateNetPositionPct, LineStyle:{Dashed:2}, usePaperChartLifetime:()=>{}, PaperChartOrderBar:(p:any)=>React.createElement('bar',p)};
runInNewContext(built.code, scope);
const Component=scope.exports.Component;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
function series() {
 const lines=new Set<any>();
 return {lines, createPriceLine(options:any){const line={options,applyOptions(o:any){assert.ok(lines.has(line));line.options=o;}};lines.add(line);return line;},removePriceLine(line:any){assert.ok(lines.delete(line),'only remove a live owned price line');}};
}
const order=(id:string,kind:string,price:number)=>({id,protectionType:kind,price,triggerPrice:price,size:.002});
const base:any={stopLoss:[],takeProfit:[],coordinates:{priceToCoordinate:(p:number)=>p,coordinateToPrice:(p:number)=>p},chartWidth:800,chartHeight:400,side:'long',referencePrice:100,positionQuantity:.002,positionEntryPrice:100,netAtPrice:(p:number)=>(p-100)*.002,onAmend:async()=>{},onCancel:async()=>{},onError:()=>{}};
test('first TP then SL render canonical labels without crashing; lines stay singular through refresh; unmount removes only owned lines',async()=>{
 const s=series(); let tree:any;let props={...base,candleSeries:s};
 await act(async()=>{tree=create(React.createElement(Component,props));});
 props={...props,takeProfit:[order('tp','TAKE_PROFIT',120)]};
 await act(async()=>{tree.update(React.createElement(Component,props));});
 assert.equal(tree.root.findAllByType('bar').length,1);
 assert.equal(tree.root.findByType('bar').props.projectedNetPct,20);
 const original=[...s.lines][0];
 props={...props,stopLoss:[order('sl','STOP_LOSS',90)]};
 await act(async()=>{tree.update(React.createElement(Component,props));});
 assert.equal(s.lines.size,2);
 for(let i=0;i<2;i++)await act(async()=>{tree.update(React.createElement(Component,{...props,takeProfit:[...props.takeProfit],stopLoss:[...props.stopLoss]}));});
 assert.ok(s.lines.has(original));assert.equal(s.lines.size,2);
 assert.deepEqual(tree.root.findAllByType('bar').map((b:any)=>b.props.projectedNetPct),[-10,20]);
 await act(async()=>{tree.unmount();});assert.equal(s.lines.size,0);
});
test('series replacement retires old lines before creating new owned lines',async()=>{
 const old=series(),next=series();let tree:any;const props={...base,takeProfit:[order('tp','TAKE_PROFIT',120)]};
 await act(async()=>{tree=create(React.createElement(Component,{...props,candleSeries:old}));});
 await act(async()=>{tree.update(React.createElement(Component,{...props,candleSeries:next}));});
 assert.equal(old.lines.size,0);assert.equal(next.lines.size,1);
 await act(async()=>{tree.unmount();});assert.equal(next.lines.size,0);
});
