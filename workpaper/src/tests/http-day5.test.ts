import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { signCapability } from '@/lib/security/tokens';
import { FileEventStore } from '@/lib/persistence/file-store';
import { executeCommand } from '@/lib/events/service';
import { executeFilingCommand } from '@/lib/filing/service';
const base=process.env.WORKPAPER_TEST_URL;
const workspaceId=`ws_filing_http_${randomUUID()}`;
const otherId=`ws_filing_http_${randomUUID()}`;
const store=new FileEventStore();
async function get(path:string,actor:string,ws=workspaceId) {
  const token=signCapability({kind:'session',workspaceId:ws,personaId:actor,branchId:'main',locked:true,expires:Date.now()+60000});
  return fetch(base+path,{headers:{cookie:'wp_session='+token},redirect:'manual'});
}
afterAll(async()=>{if(base){await store.deleteWorkspace(workspaceId);await store.deleteWorkspace(otherId);}});
describe.skipIf(!base)('Filing and export HTTP boundaries',()=>{
  it('serves client summaries without internal evidence and enforces export roles and isolation',async()=>{
    await executeCommand({command:{type:'record_note',workspaceId,branchId:'main',text:'PRIVATE_DAY5_REVIEW_NOTE',visibility:'internal',blocking:true,idempotencyKey:randomUUID()},actorId:'st-01',sessionWorkspaceId:workspaceId,store});
    const frozen=await executeFilingCommand({command:{type:'freeze_package',scope:'prepared_demo',workspaceId,branchId:'main',expectedSequence:1,idempotencyKey:randomUUID()},actorId:'st-01',sessionWorkspaceId:workspaceId,store,asOf:'2026-06-23'});
    expect(frozen.ok).toBe(true);if(!frozen.ok)throw new Error(frozen.message);
    const id=frozen.state.snapshots[0].id;
    const clientPage=await get('/filing','cu-01');
    expect(clientPage.status).toBe(200);
    const html=await clientPage.text();
    expect(html).toContain('Approve this exact summary');
    expect(html).not.toContain('PRIVATE_DAY5_REVIEW_NOTE');
    expect(html).not.toContain('documentHashes');
    const copy=await get(`/api/exports/${id}?kind=client`,'cu-01');
    expect(copy.status).toBe(200);
    expect(copy.headers.get('content-disposition')).toContain('attachment');
    expect(await copy.text()).not.toContain('PRIVATE_DAY5_REVIEW_NOTE');
    expect((await get(`/api/exports/${id}?kind=notice`,'cu-01')).status).toBe(403);
    expect((await get(`/api/exports/${id}?kind=client`,'st-05')).status).toBe(403);
    expect((await get(`/api/exports/${id}?kind=client`,'st-01',otherId)).status).toBe(404);
    const notice=await get(`/api/exports/${id}?kind=notice`,'st-04');
    expect(notice.status).toBe(200);
    const body=await notice.text();
    expect(body).toContain('PRIVATE_DAY5_REVIEW_NOTE');
    expect(body).not.toMatch(/<script|https?:\/\//);
    for(const token of ['666-41-2287','666-52-9134','482915','990000017'])expect(body).not.toContain(token);
  });
  it('denies clients direct replay, scenario and version payloads',async()=>{
    for(const path of ['/replay?at=tl-29','/replay/evidence?at=tl-22&ref=D71&page=1','/versions','/scenarios']) {
      const response=await get(path,'cu-01');const body=await response.text();
      expect(response.status===307 || body.includes('NEXT_REDIRECT')).toBe(true);
      expect(body).not.toContain('666-41-2287');
    }
  });
});
