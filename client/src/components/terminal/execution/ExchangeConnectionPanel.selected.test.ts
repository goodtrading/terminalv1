import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync('client/src/components/terminal/execution/ExchangeConnectionPanel.tsx','utf8');
const ast=ts.createSourceFile('card.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler='';
function visit(node:ts.Node){
  if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onClick'&&node.initializer&&ts.isJsxExpression(node.initializer)){
    const expression=node.initializer.expression;
    if(expression?.getText(ast).includes('if (isPaper && paperConnected)'))handler=expression.getText(ast);
  }
  ts.forEachChild(node,visit);
}
visit(ast);
test('Selected Paper is idempotent: repeated clicks never disconnect, change workspace, or navigate',()=>{
  assert.ok(handler);
  let calls=0;
  const callback=new Function('disabled','isPaper','paperConnected','isBingx','bingxConnected','onManage','onConnect','onDisconnect',`return (${handler})`)(false,true,true,false,false,()=>calls++,()=>calls++,()=>calls++);
  callback();callback();callback();
  assert.equal(calls,0);
});
test('Open Paper selects it once through the normal connection action',()=>{
  let selected=0;
  const callback=new Function('disabled','isPaper','paperConnected','isBingx','bingxConnected','onManage','onConnect',`return (${handler})`)(false,true,false,false,false,undefined,()=>selected++);
  callback();assert.equal(selected,1);
});
