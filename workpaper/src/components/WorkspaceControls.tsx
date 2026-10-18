'use client';
import { useHydrated } from './useHydrated';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchPersona } from '@/app/actions/workspace';
export function WorkspaceControls({ personaId, workspaceId, branchId, options, locked }: { personaId:string; workspaceId:string; branchId:string; options:Array<{id:string; name:string; role:string}>; locked:boolean }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [pending,start] = useTransition();
  const [status,setStatus] = useState('Connecting…');
  const [count,setCount] = useState(0);
  const revision = useRef<string|null>(null);
  useEffect(() => {
    let active = true;
    let timer:ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll() {
      try {
        if (document.visibilityState !== 'hidden') {
          const response = await fetch('/api/workspace-status', { cache:'no-store', signal:abort.signal });
          if (!response.ok) throw new Error('Sync unavailable');
          const value = await response.json();
          if (!active) return;
          if (value.sessionKey !== `${workspaceId}:${personaId}:${branchId}`) { window.location.replace(new URL('/collaboration', window.location.origin).href); return; }
          if (revision.current !== null && revision.current !== value.revision) router.refresh();
          revision.current = value.revision;
          setCount(value.notificationCount);
          setStatus('Synced · checks every 5s');
        }
      } catch { if (active) setStatus('Offline · retrying'); }
      if (active) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { active=false; clearTimeout(timer); abort.abort(); };
  }, [router, workspaceId, personaId, branchId]);
  return <div className="flex flex-wrap items-center gap-3 text-xs">
    <label>Demo persona <select aria-label="Demo persona" value={personaId} disabled={pending || locked || !hydrated} onChange={e=>{const id=e.target.value;start(async()=>{const result=await switchPersona(id); if(result.ok) window.location.replace(new URL('/collaboration', window.location.origin).href); else setStatus(result.message ?? 'Switch failed');});}} className="border rounded p-1 bg-panel">{options.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>
    {locked && <span>Invitation role locked</span>}
    <span role="status">{status}</span><a href="/collaboration">Inbox ({count})</a>
  </div>;
}
