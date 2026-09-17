import assert from "node:assert/strict";
import test from "node:test";
import { parseBingXBookTickerMessage } from "./bingxBookTicker";
import { validateDurableBingXBboEvent } from "./bingxBboHistory";
import { BingXBboPersistenceConsumer } from "./bingxBboPersistenceConsumer";

const raw=JSON.stringify({data:{s:"BTC-USDT",b:"1.000000000000000001",B:"0.000000000000000123",a:"2.000000000000000002",A:"3.000000000000000456",T:1000,u:99}});
function event(){const r=parseBingXBookTickerMessage(raw,new Date(61000));assert.equal(r.ok,true);if(!r.ok)throw new Error();return r.event;}
test("validates durable event without changing exact values or source age",()=>{const r=validateDurableBingXBboEvent(event());assert.equal(r.ok,true);if(r.ok){assert.equal(r.event.bestBid,"1.000000000000000001");assert.equal(r.event.bestAskQuantity,"3.000000000000000456");assert.equal(r.event.sourceAgeAtObservationMs,60000);assert.equal(r.event.providerSequence,"99");}});
test("consumer serializes writes, preserves identical events, and reports failures",async()=>{const order:string[]=[];const errors:unknown[]=[];const c=new BingXBboPersistenceConsumer({persist:async e=>{order.push(e.bestBid);await new Promise(r=>setTimeout(r,1));if(e.bestBid==="3")throw new Error("DB_DOWN")},onError:e=>errors.push(e)});assert.equal(c.enqueue({...event(),bestBid:"1"}),true);assert.equal(c.enqueue({...event(),bestBid:"2"}),true);assert.equal(c.enqueue({...event(),bestBid:"3"}),true);await c.drain();assert.deepEqual(order,["1","2","3"]);assert.equal(errors.length,1);assert.equal(c.pendingCount,0);});
test("bounds queue without silently accepting an event",()=>{let error="";const c=new BingXBboPersistenceConsumer({maxQueueSize:1,persist:()=>new Promise(()=>{}),onError:e=>error=String(e)});assert.equal(c.enqueue(event()),true);assert.equal(c.enqueue(event()),false);assert.match(error,/QUEUE_FULL/);});
