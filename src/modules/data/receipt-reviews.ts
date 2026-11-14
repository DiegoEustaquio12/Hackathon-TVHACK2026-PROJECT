import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { receiptSchema,type ReceiptExtraction } from '../interpretation/receipts';
export const receiptReviewSchema=z.object({id:z.string().uuid(),business_id:z.string().uuid(),media_id:z.string().uuid(),
  media_sha256:z.string().regex(/^[a-f0-9]{64}$/),extraction:receiptSchema,
  classification:z.enum(['sale','expense','purchase']).nullable(),occurred_at:z.string(),expires_at:z.string()});
export type ReceiptReview=z.infer<typeof receiptReviewSchema>;
export interface ReceiptReviewRepository {
  save(sender:string,storageKey:string,extraction:ReceiptExtraction,occurredAt:string):Promise<ReceiptReview>;
  get(sender:string,id:string):Promise<ReceiptReview>;
  classify(sender:string,id:string,kind:'sale'|'expense'|'purchase'):Promise<ReceiptReview>;
}
const phone=z.string().regex(/^[1-9][0-9]{7,14}$/);
export function createReceiptReviewRepository(client:SupabaseClient):ReceiptReviewRepository {
  async function run(name:string,args:Record<string,unknown>) {
    const {data,error}=await client.rpc(name,args);if(error) throw error;
    return receiptReviewSchema.parse(data);
  }
  return {
    save:(sender,key,extraction,occurredAt)=>run('save_receipt_review',{p_sender:phone.parse(sender),
      p_storage_key:z.string().min(1).max(1024).parse(key),p_extraction:receiptSchema.parse(extraction),
      p_occurred_at:z.iso.datetime({offset:true}).parse(occurredAt)}),
    get:(sender,id)=>run('get_receipt_review',{p_sender:phone.parse(sender),p_id:z.string().uuid().parse(id)}),
    classify:(sender,id,kind)=>run('classify_receipt_review',{p_sender:phone.parse(sender),p_id:z.string().uuid().parse(id),
      p_kind:z.enum(['sale','expense','purchase']).parse(kind)}),
  };
}
