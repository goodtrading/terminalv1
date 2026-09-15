import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";

// This integration test uses a mocked submitter; make the test-only live guards explicit.
process.env.BINGX_READ_ONLY_FREEZE = "false";
process.env.BINGX_ENABLE_LIVE_TRADING = "true";
process.env.BINGX_ENABLE_API_TRADING = "true";
process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
process.env.BINGX_LIVE_LIMIT_TEST_MODE = "true";
const d=pool?describe:describe.skip;
const ready={status:"ready_for_live" as const,exchange:"bingx" as const,liveTradingEnabled:true,apiTradingEnabled:true,orderSubmitEnabled:true,orderCancelEnabled:false,positionCloseEnabled:false,marketOrdersAllowed:false,killSwitchActive:false,checks:[],blockers:[],warnings:[],readyForDryRun:true,readyForLive:true,readOnlyFreezeActive:false};
const prev={mode:"dry_run" as const,exchange:"bingx" as const,symbol:"BTC-USDT",side:"buy" as const,type:"limit" as const,orderWouldBeSent:false as const,tradingLocked:true,validated:true,blocked:false,blockers:[],warnings:[],estimate:{entryPrice:65000,quantity:.001,notionalUsdt:65}};
const req=(k:string)=>({exchange:"bingx" as const,symbol:"BTC-USDT",side:"buy" as const,type:"limit" as const,quantity:.001,limitPrice:64000,stopLossPrice:63000,leverage:5,reduceOnly:false,requestIdempotencyKey:k,confirmationText:LIVE_LIMIT_CONFIRMATION_TEXT});
const deps=(broker:any,extra:any={})=>({getReadiness:async()=>ready,previewOrder:async()=>prev,getConnection:()=>({id:"ack-test",readOnly:false,connectionMode:"live",tradingPermissionConfirmed:true}),getCredentials:()=>({apiKey:"test",secretKey:"test"}),getSymbolRules:async()=>({symbol:"BTC-USDT",minQty:.0001,maxQty:100,stepSize:.0001,quantityPrecision:4,pricePrecision:2,minNotional:5}),submitOrder:broker,...extra});
async function clean(c:pg.PoolClient,u:number,a:string){await c.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1)",[a]);await c.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1",[a]);await c.query("DELETE FROM goodtrading_accounts WHERE user_id=$1",[u]);await c.query("DELETE FROM users WHERE id=$1",[u]);}
d("ACK is not lifecycle acceptance",()=>{it("returns transport success without N7 lifecycle synthesis",{timeout:120000},async()=>{const m=`${Date.now()}-b2t-ack`;const ur=await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id",[`${m}@example.test`,"test","B2T ack"]);const u=Number(ur.rows[0].id),a=(await ensureGoodTradingAccountForUser(u)).accountUid;const op=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,statement_timeout:10000}),c=await op.connect();const {submitBingXLiveLimitOrder}=await import("./liveOrderSubmitService");let calls=0;try{const r=await submitBingXLiveLimitOrder(u,req(`k-${m}`),deps(async(p:any)=>{calls++;return {orderId:"broker-id",clientOrderId:p.clientOrderId,protectiveSlAttached:false};},{getAccount:async()=>({accountUid:a})}));assert.equal(calls,1);assert.equal(r.orderSubmitted,true);assert.equal(r.status,"submitted");const q=await c.query("SELECT a.attempt_number,a.transport_state,a.response_at,count(*) OVER()::int AS total FROM goodtrading_order_intents i JOIN goodtrading_order_submission_attempts a ON a.intent_id=i.id WHERE i.goodtrading_account_uid=$1 AND i.request_idempotency_key=$2",[a,`k-${m}`]);assert.equal(q.rows.length,1);assert.equal(q.rows[0].attempt_number,1);assert.equal(q.rows[0].transport_state,"SUBMISSION_RESPONSE_OBSERVED");assert.ok(q.rows[0].response_at instanceof Date);assert.equal(q.rows[0].total,1);}finally{await clean(c,u,a);c.release();await op.end();}})});
