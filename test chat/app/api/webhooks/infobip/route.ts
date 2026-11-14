import { createInfobipRoute } from '@/src/modules/http/infobip';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=createInfobipRoute();
