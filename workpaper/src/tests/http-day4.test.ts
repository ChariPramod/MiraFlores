import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { signCapability } from '@/lib/security/tokens';
import { FileEventStore } from '@/lib/persistence/file-store';
import { executeCommand } from '@/lib/events/service';
const base = process.env.WORKPAPER_TEST_URL;
const workspaceId=`ws_http_${randomUUID()}`;
const otherId=`ws_http_${randomUUID()}`;
const store=new FileEventStore();
function cookie(actor:string, ws=workspaceId) { return 'wp_session='+signCapability({kind:'session',workspaceId:ws,personaId:actor,locked:true,expires:Date.now()+60000}); }
async function get(path:string,actor:string,ws=workspaceId) { return fetch(base+path,{headers:{cookie:cookie(actor,ws)},redirect:'manual'}); }
afterAll(async()=>{if(base){await store.deleteWorkspace(workspaceId);await store.deleteWorkspace(otherId);}});
describe.skipIf(!base)('Live HTTP server boundaries',()=>{
  it('excludes sensitive data from HTML and Flight payloads for st-04',async()=>{
    for(const route of ['/document/D03/page/1','/document/D04/page/1','/document/D08/page/1','/claim/F1040.7','/findings','/collaboration']) {
      const response=await get(route,'st-04');expect(response.status).toBe(200);
      const raw=await response.text();
      for(const token of ['666-41-2287','666-52-9134','482915','990000017','4483019276']) expect(raw).not.toContain(token);
    }
  });
  it('denies direct client document, claim, and staff-list access',async()=>{
    for(const route of ['/document/D08/page/1','/claim/F1040.7','/documents','/findings']) {
      const response=await get(route,'cu-01');
      const raw=await response.text();
      expect(response.status===307 || raw.includes('NEXT_REDIRECT')).toBe(true);
      expect(raw).not.toContain('666-41-2287');
      expect(raw).not.toContain('Supplied engine value');
    }
  });
  it('updates an invited client polling session while another workspace stays isolated',async()=>{
    const before=await (await get('/api/workspace-status','cu-01')).json();
    const separate=await (await get('/api/workspace-status','cu-01',otherId)).json();
    await executeCommand({command:{type:'ask_question',workspaceId,branchId:'main',clientId:'cu-01',text:'HTTP isolation and shared update probe',idempotencyKey:randomUUID()},actorId:'st-01',sessionWorkspaceId:workspaceId,store});
    const shared=await (await get('/api/workspace-status','cu-01')).json();
    expect(shared.revision).not.toBe(before.revision);
    expect(shared.notificationCount).toBe(1);
    expect(await (await get('/api/workspace-status','cu-01',otherId)).json()).toEqual(separate);
    expect(await (await get('/collaboration','cu-02')).text()).not.toContain('HTTP isolation and shared update probe');
  });
});
