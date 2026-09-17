import type { BingXBookTickerBboEvent } from "./bingxBookTicker";
import { insertBingXBboEvent } from "./bingxBboHistoryRepository";

export type BingXBboPersistenceConsumerOptions = Readonly<{ maxQueueSize?: number; persist?: (event: BingXBookTickerBboEvent) => Promise<unknown>; onError?: (error: unknown, event: BingXBookTickerBboEvent) => void }>;
export class BingXBboPersistenceConsumer {
  private readonly maxQueueSize: number; private readonly persist: (event:BingXBookTickerBboEvent)=>Promise<unknown>; private readonly onError?: (error:unknown,event:BingXBookTickerBboEvent)=>void; private queue: BingXBookTickerBboEvent[]=[]; private processing=false; private processingPromise: Promise<void>|null=null;
  constructor(options:BingXBboPersistenceConsumerOptions={}) { this.maxQueueSize=options.maxQueueSize??1000; this.persist=options.persist??insertBingXBboEvent; this.onError=options.onError; }
  get pendingCount(): number { return this.queue.length; }
  enqueue(event:BingXBookTickerBboEvent): boolean { if(this.queue.length+(this.processing?1:0)>=this.maxQueueSize){this.onError?.(new Error("BBO_PERSISTENCE_QUEUE_FULL"),event);return false;} this.queue.push(event);void this.drain();return true; }
  async drain(): Promise<void> { if(this.processing){await this.processingPromise;return;} this.processing=true;this.processingPromise=(async()=>{try{while(this.queue.length){const event=this.queue.shift()!;try{await this.persist(event);}catch(error){this.onError?.(error,event);}}}finally{this.processing=false;this.processingPromise=null;}})();await this.processingPromise; }
}
