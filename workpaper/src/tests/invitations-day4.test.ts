import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MemoryEventStore } from '@/lib/persistence/memory-store';
import { SESSION_COOKIE, signCapability, verifyCapability } from '@/lib/security/tokens';
const jar=vi.hoisted(()=>new Map<string,string>());
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>jar.has(name)?{value:jar.get(name)}:undefined,set:(name:string,value:string)=>jar.set(name,value)})}));
const store=new MemoryEventStore();
vi.mock('@/lib/persistence/get-store',()=>({getEventStore:()=>store}));
import { createInvite, joinWorkspace, switchPersona, selectBranch } from '@/app/actions/workspace';
import { getOrCreateWorkspaceSession } from '@/lib/workspace/session';

describe('Role-bound invitations',()=>{
  it('joins the exact invited workspace and prevents persona escalation or re-sharing',async()=>{
    const workspaceId=`ws_invite_${randomUUID()}`;
    jar.set(SESSION_COOKIE,signCapability({kind:'session',workspaceId,personaId:'st-01',locked:false,expires:Date.now()+60000}));
    const invite=await createInvite('cu-01');expect(invite.ok).toBe(true);
    const code=invite.token!;
    jar.set(SESSION_COOKIE,signCapability({kind:'session',workspaceId:`ws_other_${randomUUID()}`,personaId:'st-01',locked:false,expires:Date.now()+60000}));
    expect((await joinWorkspace(code)).ok).toBe(true);
    expect(await getOrCreateWorkspaceSession()).toMatchObject({workspaceId,personaId:'cu-01',locked:true});
    jar.set('wp_persona','st-03'); // The old, unsigned cookie must have no effect.
    expect((await getOrCreateWorkspaceSession()).personaId).toBe('cu-01');
    expect((await switchPersona('st-03')).ok).toBe(false);
    expect((await createInvite('st-03')).ok).toBe(false);
    expect(verifyCapability(jar.get(SESSION_COOKIE),'session')?.expires).toBe(verifyCapability(code,'invite')?.expires);
  });
  it('rejects expired invitations and inactive persona selection',async()=>{
    const workspaceId=`ws_invite_${randomUUID()}`;
    jar.set(SESSION_COOKIE,signCapability({kind:'session',workspaceId,personaId:'st-01',locked:false,expires:Date.now()+60000}));
    expect((await createInvite('st-06')).ok).toBe(false);
    expect((await switchPersona('st-06')).ok).toBe(false);
    const expired=signCapability({kind:'invite',workspaceId,personaId:'cu-01',locked:true,expires:Date.now()-1});
    expect((await joinWorkspace(expired)).ok).toBe(false);
  });
  it('preserves signed branch context and rejects foreign or malformed branch selection',async()=>{
    const workspaceId=`ws_branch_${randomUUID()}`;
    jar.set(SESSION_COOKIE,signCapability({kind:'session',workspaceId,personaId:'st-01',branchId:'main',locked:false,expires:Date.now()+60000}));
    await store.ensureWorkspace(workspaceId);
    expect((await selectBranch('other-workspace-branch')).ok).toBe(false);
    expect((await selectBranch('../main')).ok).toBe(false);
    expect((await selectBranch('main')).ok).toBe(true);
    expect((await switchPersona('st-02')).ok).toBe(true);
    expect((await getOrCreateWorkspaceSession()).branchId).toBe('main');
    const invite=await createInvite('cu-01');
    expect(verifyCapability(invite.token,'invite')?.branchId).toBe('main');
    const invalid=signCapability({kind:'session',workspaceId,personaId:'st-01',branchId:'../main',locked:false,expires:Date.now()+60000});
    expect(verifyCapability(invalid,'session')).toBeNull();
  });

});
