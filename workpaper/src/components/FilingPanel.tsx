'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from './useHydrated';
import { submitFilingCommand } from '@/app/actions/filing';
import { selectBranch } from '@/app/actions/workspace';
import type { FrozenSnapshot, FilingReadiness } from '@/lib/filing/types';

export type FilingView = {
  branchId:string; sequence:number; frozen:boolean; role:string;
  branches:Array<{id:string;label:string;parentSnapshotId?:string;parentBranchId?:string;mode?:string}>;
  snapshots:Array<Pick<FrozenSnapshot,'id'|'label'|'contentHash'|'createdAt'|'scope'|'eventCutoff'|'summary'> & { summaryHash:string; current:boolean; readiness?:FilingReadiness }>;
  approvals:Array<{snapshotId:string;level:string;actorId:string}>;
  attempts:Array<{snapshotId:string;jurisdiction:string;status:string;reference:string;recordedAt:string}>;
  jurisdictionStatus:Record<string,string>;
};
const money = (value:number|null) => value === null ? 'Not recorded' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
export function FilingPanel({ view }: { view:FilingView }) {
  const hydrated=useHydrated();
  const [pending,start]=useTransition();
  const [message,setMessage]=useState('');
  const router=useRouter();
  const staff=['preparer','reviewer','partner'].includes(view.role);
  const canApprove=['reviewer','partner','client'].includes(view.role);
  const disabled=pending || !hydrated;
  const activeBranch=view.branches.find(b=>b.id===view.branchId);
  function run(command:object) {
    start(async()=>{
      try {
        const result=await submitFilingCommand({...command,expectedSequence:view.sequence,idempotencyKey:crypto.randomUUID()});
        setMessage(result.message);
        router.refresh();
      } catch { setMessage('Save failed. Refresh to check the record before retrying.'); }
    });
  }
  return <div className="space-y-6">
    <section className="rounded border border-line bg-panel p-4 space-y-3">
      <label className="block text-sm">Working branch <select aria-label="Working branch" value={view.branchId} disabled={disabled} className="rounded border p-2 ml-2 max-w-full" onChange={e=>{const id=e.target.value;start(async()=>{const result=await selectBranch(id);if(result.ok)window.location.replace('/filing');else setMessage(result.message ?? 'Branch unavailable');});}}>{view.branches.map(b=><option key={b.id} value={b.id}>{b.label}{b.mode ? ` · ${b.mode}` : ''}</option>)}</select></label>
      {activeBranch?.parentSnapshotId && <p className="text-sm">Inherited from preserved package <code>{activeBranch.parentSnapshotId}</code>. <a href={`/api/exports/${encodeURIComponent(activeBranch.parentSnapshotId)}?kind=client&branch=${encodeURIComponent(activeBranch.parentBranchId ?? 'main')}`}>Download parent copy</a></p>}
      <p className="text-sm">{view.frozen ? 'Submitted branch is frozen. Corrections require a successor draft or amendment.' : 'Draft branch. Changes require a new package and new approvals.'}</p>
      <div className="flex flex-wrap gap-4 text-sm">{Object.entries(view.jurisdictionStatus).map(([key,value])=><span key={key} className="rounded bg-paper-deep px-3 py-2 capitalize">{key}: <strong>{value.replaceAll('_',' ')}</strong></span>)}</div>
    </section>
    <p role="status" className="text-sm text-accent">{message}</p>
    {staff && !view.frozen && <section className="rounded border border-line p-4 space-y-3">
      <h2 className="font-serif text-xl">Prepare a review package</h2>
      <p className="text-sm text-ink-muted">A package preserves the current evidence and decisions. Approvals bind to its hash. Full-return submission remains blocked while the broader checks are unfinished.</p>
      <div className="flex flex-wrap gap-3"><button disabled={disabled} onClick={()=>run({type:'freeze_package',scope:'prepared_demo'})} className="rounded bg-ink text-paper p-2">Freeze N1 demonstration package</button><button disabled={disabled} onClick={()=>run({type:'freeze_package',scope:'full_return'})} className="rounded border p-2">Assess full-return readiness</button></div>
    </section>}
    {!view.snapshots.length && <p>No review package yet. A preparer can freeze a package after recording the N1 correction and verification.</p>}
    {[...view.snapshots].reverse().map(s=>{
      const attempts=view.attempts.filter(a=>a.snapshotId===s.id);
      const approvals=view.approvals.filter(a=>a.snapshotId===s.id);
      return <article key={s.id} className="rounded border border-line bg-panel p-5 space-y-4">
        <header><h2 className="font-serif text-2xl">{s.label}</h2><p className="text-sm">{s.scope==='prepared_demo' ? 'N1 workflow demonstration only' : 'Full-return readiness assessment'} · {s.createdAt}</p><p className="text-xs font-mono break-all mt-2">Package {s.id}<br/>SHA-256 {s.contentHash}<br/>Recorded through event {s.eventCutoff}</p></header>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="p-2">N1</th><th className="p-2">Engine original</th><th className="p-2">Working decision</th></tr></thead><tbody><tr><td className="p-2">Basis</td><td className="p-2">{money(s.summary.n1.engineBasis)}</td><td className="p-2">{money(s.summary.n1.workingBasis)}</td></tr><tr><td className="p-2">Gain</td><td className="p-2">{money(s.summary.n1.engineGain)}</td><td className="p-2">{money(s.summary.n1.workingGain)}</td></tr></tbody></table></div>
        <p className="text-sm">Engine version: {s.summary.engineVersion} · N1 evidence: {s.summary.n1.evidenceRefs.join(', ') || 'None recorded'}</p>
        <section className="space-y-2"><h3 className="font-medium">All adjustments included in this summary</h3>
          {!s.summary.adjustments.length ? <p className="text-sm">None recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="p-2">Claim / field</th><th className="p-2">Original → working</th><th className="p-2">Working gain</th><th className="p-2">Federal estimate</th><th className="p-2">California estimate</th></tr></thead><tbody>{s.summary.adjustments.map((a,i)=><tr key={i} className="border-b border-line"><td className="p-2">{a.claimKey} / {a.field}</td><td className="p-2">{money(a.originalValue)} → {money(a.effectiveValue)}</td><td className="p-2">{a.workingGain===undefined?'Not calculated':money(a.workingGain)}</td><td className="p-2">{money(a.federalEstimate)}</td><td className="p-2">{money(a.californiaEstimate)}</td></tr>)}</tbody></table></div>}
        </section>
        {!s.current && <p className="rounded border border-warn p-3 text-sm">Historical package: working content has changed. A new package and fresh approvals are required.</p>}
        <ul className="text-sm text-ink-muted list-disc pl-5">{s.summary.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul>
        <p className="text-sm">Approvals: {approvals.length ? approvals.map(a=>`${a.level} (${a.actorId})`).join(' · ') : 'None yet'}</p>
        {s.readiness && <section className="rounded bg-paper-deep p-3"><h3 className="font-medium">{s.readiness.ready ? (attempts.length===2 ? 'Both jurisdiction attempts are preserved' : 'Ready for a simulated submission') : 'Submission is blocked'}</h3><ul className="list-disc pl-5 text-sm">{s.readiness.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul></section>}
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="border rounded p-2" href={`/api/exports/${encodeURIComponent(s.id)}?kind=client`}>Download client copy</a>
          {staff && <a className="border rounded p-2" href={`/api/exports/${encodeURIComponent(s.id)}?kind=notice`}>Download offline evidence</a>}
          {canApprove && s.current && !view.frozen && !approvals.some(a=>a.level===view.role) && <button className="border rounded p-2" disabled={disabled} onClick={()=>run({type:'approve_package',snapshotId:s.id,level:view.role,presentedSummaryHash:s.summaryHash})}>{view.role==='client'?'Approve this exact summary':`Record ${view.role} approval`}</button>}
        </div>
        {view.role==='client' && <p className="text-xs text-ink-muted">Approval applies only to this displayed package. This demonstration does not authorize or transmit a real tax return.</p>}
        {attempts.length>0 && <section><h3 className="font-medium">Immutable submission attempts</h3><ul className="text-sm space-y-1">{attempts.map(a=><li key={a.reference}>{a.jurisdiction} · {a.status} · {a.reference} · {a.recordedAt}</li>)}</ul></section>}
        {view.role==='partner' && s.current && attempts.length<2 && <form className="flex flex-wrap gap-3 items-end rounded border border-line p-3" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);run({type:'submit_filing',snapshotId:s.id,jurisdiction:d.get('jurisdiction'),simulatedResult:d.get('result'),reason:d.get('reason')});}}>
          <label className="text-sm">Jurisdiction<select name="jurisdiction" className="block border p-1"><option value="federal">Federal</option><option value="california">California</option></select></label>
          <label className="text-sm">Simulated result<select name="result" className="block border p-1"><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></label>
          <label className="text-sm flex-1 min-w-48">Reason<input name="reason" required minLength={5} maxLength={2000} className="block border p-1 w-full" placeholder="Demonstrate the acceptance or rejection path" /></label>
          <button disabled={disabled || !s.readiness?.ready} className="rounded bg-ink text-paper p-2 disabled:opacity-40">Record simulated result</button>
        </form>}
        {staff && attempts.length>0 && <form className="flex flex-wrap gap-3 items-end" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);run({type:d.get('mode'),snapshotId:s.id,reason:d.get('reason')});}}>
          <label className="text-sm">Continue on<select name="mode" className="block border p-1">{attempts.some(a=>a.status==='accepted')&&<option value="create_amendment">Amendment branch</option>}{attempts.some(a=>a.status==='rejected')&&<option value="create_successor">Successor draft</option>}</select></label><label className="flex-1 text-sm">Reason<input name="reason" required minLength={5} maxLength={2000} className="block border p-1 w-full" /></label><button disabled={disabled} className="rounded border p-2">Create branch</button>
        </form>}
      </article>;
    })}
  </div>;
}
