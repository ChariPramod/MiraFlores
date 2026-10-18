'use client';
import { useHydrated } from './useHydrated';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitCommand } from '@/app/actions/commands';
import { createInvite, joinWorkspace } from '@/app/actions/workspace';
import type { collaborationView } from '@/lib/workspace/collaboration';

type Props = { view:ReturnType<typeof collaborationView>; actorId:string; role:string; locked:boolean; people:Array<{id:string;name:string;role:string}>; notes:Array<{noteId:string;text:string;resolved:boolean;blocking:boolean}> };
export function CollaborationPanel({view,actorId,role,locked,people,notes}:Props) {
  const hydrated = useHydrated();
  const [pending,start] = useTransition();
  const [message,setMessage] = useState('');
  const [invite,setInvite] = useState('');
  const router = useRouter();
  const taxStaff = ['preparer','reviewer','partner'].includes(role);
  function run(command:object) {
    start(async()=>{
      const result=await submitCommand({...command,idempotencyKey:crypto.randomUUID()});
      setMessage(result.ok ? 'Saved to workspace history.' : result.message);
      if(result.ok) router.refresh();
    });
  }
  return <div className="space-y-6">
    <p role="status" className="text-sm">{message}</p>
    <section className="rounded border border-line bg-panel p-4"><h2 className="font-serif text-xl">Your notifications</h2>
      {view.notices.length ? <ul>{view.notices.map(n=><li key={n.id}>{n.text}</li>)}</ul> : <p className="text-sm text-ink-muted">Nothing needs your attention.</p>}
    </section>
    {taxStaff && <form method="post" className="rounded border border-line p-4 space-y-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);run({type:'ask_question',text:data.get('text'),clientId:data.get('clientId'),claimKey:String(data.get('claimKey')||'')||undefined});}}>
      <h2 className="font-serif text-xl">Ask a client</h2>
      <label className="block">Client <select name="clientId" className="border p-1">{people.filter(p=>p.role==='client').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block">Claim (optional) <input name="claimKey" placeholder="F8949.B.N1" className="border p-1" /></label>
      <label className="block">Question <textarea name="text" required minLength={3} maxLength={5000} className="block border p-2 w-full" /></label>
      <button disabled={pending || !hydrated} className="rounded bg-ink text-paper p-2">Save question</button>
      <p className="text-xs text-ink-muted">In-app only. Nothing is emailed. Answers are evidence for review, not automatic adjustments.</p>
    </form>}
    <section className="space-y-4"><h2 className="font-serif text-2xl">Client questions</h2>
      {!view.questions.length && <p>No questions visible to this persona.</p>}
      {view.questions.map(q=><article key={q.id} className="rounded border border-line bg-panel p-4 space-y-3">
        <div className="text-xs text-ink-muted">{q.clientId} · {q.claimKey ?? 'General'} · {q.resolved ? 'Resolved' : 'Open'}</div>
        <p>{q.text}</p>
        {q.answers.map(a=><div key={a.id} className="bg-paper-deep p-3"><p>{a.text}</p><p className="text-xs font-mono">Evidence: answer:{a.id}</p>{a.attachment && <details><summary>{a.attachment.name} · restricted upload</summary><pre className="whitespace-pre-wrap text-xs">{a.attachment.text || 'Requires sensitive-data clearance.'}</pre></details>}</div>)}
        {q.resolution && <p>Resolution: {q.resolution}</p>}
        {!q.resolved && actorId===q.clientId && <form method="post" className="space-y-2" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const file=data.get('attachment') as File;start(async()=>{if(file?.size>64000){setMessage('Text attachments must be at most 64 KB.');return;}if(file?.size && !file.name.toLowerCase().endsWith('.txt')){setMessage('This prototype accepts .txt evidence only.');return;}const result=await submitCommand({type:'record_answer',questionId:q.id,text:data.get('answer'),attachment:file?.size ? {name:file.name,text:await file.text()}:undefined,idempotencyKey:crypto.randomUUID()});setMessage(result.ok?'Answer saved for staff review.':result.message);if(result.ok)router.refresh();});}}>
          <label className="block">Your answer<textarea name="answer" required maxLength={10000} className="block border w-full p-2" /></label>
          <label className="block text-sm">Supporting text file (optional, ≤64 KB)<input type="file" name="attachment" accept=".txt,text/plain" /></label>
          <button disabled={pending || !hydrated} className="rounded bg-ink text-paper p-2">Submit answer</button>
        </form>}
        {!q.resolved && taxStaff && <form method="post" onSubmit={e=>{e.preventDefault();run({type:'resolve_question',questionId:q.id,resolution:new FormData(e.currentTarget).get('resolution')});}}><label>Review resolution <input name="resolution" required minLength={3} className="border p-1" /></label> <button disabled={pending || !hydrated} className="border rounded p-1">Resolve question</button></form>}
      </article>)}
    </section>
    {taxStaff && <section className="space-y-3"><h2 className="font-serif text-xl">Review notes</h2>{notes.filter(n=>!n.resolved).map(n=><form method="post" key={n.noteId} className="border p-3" onSubmit={e=>{e.preventDefault();run({type:'resolve_note',noteId:n.noteId,resolution:new FormData(e.currentTarget).get('resolution')});}}><p>{n.blocking ? 'Blocking: ' : ''}{n.text}</p><label>Resolution <input name="resolution" required minLength={3} className="border p-1" /></label> <button disabled={pending || !hydrated}>Resolve note</button></form>)}</section>}
    <section className="rounded border border-line p-4 space-y-3"><h2 className="font-serif text-xl">Share this sandbox</h2>
      <p className="text-sm">Invitations grant access to this demo workspace as one fixed persona for one hour. Share the code only with the intended collaborator.</p>
      {!locked && role!=='client' && <form method="post" onSubmit={e=>{e.preventDefault();const id=String(new FormData(e.currentTarget).get('personaId'));start(async()=>{const result=await createInvite(id);if(result.ok)setInvite(result.token!);else setMessage(result.message!);});}}><label>Invite as <select name="personaId" className="border p-1">{people.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label> <button disabled={pending || !hydrated} className="border p-1">Create invitation</button></form>}
      {invite && <label className="block text-sm">Invitation code<textarea readOnly value={invite} className="block w-full border p-2 font-mono text-xs" /></label>}
      <form method="post" onSubmit={e=>{e.preventDefault();const token=String(new FormData(e.currentTarget).get('invite'));start(async()=>{const result=await joinWorkspace(token);if(result.ok)window.location.replace(new URL('/collaboration', window.location.origin).href);else setMessage(result.message!);});}}><label className="block">Join with invitation code<textarea name="invite" required className="block w-full border p-2" /></label><button disabled={pending || !hydrated} className="border rounded p-2 mt-2">Join shared workspace</button></form>
    </section>
  </div>;
}
