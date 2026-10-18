-- Frozen filing packages remain append-only events. Branches pin inherited history.
alter table branches add column if not exists parent_snapshot_id text;
alter table branches add column if not exists mode text check(mode in ('amendment','successor'));
alter table branches add column if not exists base_events jsonb not null default '[]'::jsonb;
create trigger branches_immutable before update or delete on branches
for each row execute function reject_history_mutation();

-- Serialize each branch's compare-and-append, including idempotent retries.
-- All rows in a bulk command commit or roll back together.
create or replace function append_workspace_events(
  p_workspace text, p_branch text, p_expected bigint, p_events jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  current_seq bigint;
  existing events%rowtype;
  item jsonb;
  saved events%rowtype;
  result jsonb := '[]'::jsonb;
begin
  perform 1 from branches where workspace_id = p_workspace and id = p_branch for update;
  if not found then
    return jsonb_build_object('ok',false,'code','isolation','message','Unknown workspace branch');
  end if;
  if jsonb_array_length(p_events) = 0 then
    return jsonb_build_object('ok',false,'code','validation','message','Empty command');
  end if;
  select * into existing from events where workspace_id = p_workspace and idempotency_key = p_events->0->>'idempotency_key';
  if found then
    if existing.branch_id <> p_branch or existing.actor_id <> p_events->0->>'actor_id' then
      return jsonb_build_object('ok',false,'code','conflict','message','Idempotency key belongs to another scope');
    end if;
    select jsonb_agg(to_jsonb(e) order by e.sequence) into result from events e
    where e.workspace_id = p_workspace and e.branch_id = p_branch and
      (e.id = existing.id or (existing.batch_id is not null and e.batch_id = existing.batch_id));
    return jsonb_build_object('ok',true,'deduped',true,'events',result);
  end if;
  if exists(select 1 from events where workspace_id = p_workspace and branch_id = p_branch and type = 'filing_attempt_recorded')
    and exists(select 1 from jsonb_array_elements(p_events) e where e->>'type' <> 'filing_attempt_recorded') then
    return jsonb_build_object('ok',false,'code','validation','message','Branch is frozen after simulated submission; open a successor or amendment branch');
  end if;
  select greatest(coalesce((select max(sequence) from events where workspace_id = p_workspace and branch_id = p_branch),0), jsonb_array_length(base_events)) into current_seq from branches where workspace_id=p_workspace and id=p_branch;
  if p_expected is not null and current_seq <> p_expected then
    return jsonb_build_object('ok',false,'code','stale','message','Workspace changed; reload before editing','currentSequence',current_seq);
  end if;
  for item in select value from jsonb_array_elements(p_events) loop
    if item->>'workspace_id' is distinct from p_workspace or item->>'branch_id' is distinct from p_branch then
      raise exception 'Event scope mismatch';
    end if;
    current_seq := current_seq + 1;
    insert into events (id,workspace_id,branch_id,sequence,actor_id,recorded_at,effective_at,type,target_refs,evidence_refs,reason,payload,idempotency_key,batch_id,reverses_event_id)
    values (item->>'id',p_workspace,p_branch,current_seq,item->>'actor_id',(item->>'recorded_at')::timestamptz,(item->>'effective_at')::timestamptz,item->>'type',item->'target_refs',item->'evidence_refs',item->>'reason',item->'payload',item->>'idempotency_key',item->>'batch_id',item->>'reverses_event_id') returning * into saved;
    result := result || jsonb_build_array(to_jsonb(saved));
  end loop;
  return jsonb_build_object('ok',true,'deduped',false,'events',result);
end;
$$;
revoke all on function append_workspace_events(text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function append_workspace_events(text,text,bigint,jsonb) to service_role;

-- Atomically create a child branch and its provenance event. Only the server role
-- can invoke this; clients never provide inherited event bodies directly.
create or replace function create_workspace_branch(p_workspace text, p_branch jsonb, p_base_events jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare existing events%rowtype; saved events%rowtype; snap events%rowtype;
begin
  perform 1 from workspaces where id=p_workspace for update;
  if not found then return jsonb_build_object('ok',false,'code','isolation','message','Workspace not found'); end if;
  select * into existing from events where workspace_id=p_workspace and idempotency_key=p_event->>'idempotency_key';
  if found then
    if existing.actor_id <> p_event->>'actor_id' or existing.type <> 'branch_created' then
      return jsonb_build_object('ok',false,'code','conflict','message','Idempotency key belongs to another command');
    end if;
    return jsonb_build_object('ok',true,'deduped',true,'events',jsonb_build_array(to_jsonb(existing)));
  end if;
  select * into snap from events where workspace_id=p_workspace and branch_id=p_branch->>'parent_branch_id'
    and type='snapshot_created' and payload->'snapshot'->>'id'=p_branch->>'parent_snapshot_id';
  if not found or jsonb_array_length(p_base_events) <> (snap.payload->'snapshot'->>'eventCutoff')::bigint then
    return jsonb_build_object('ok',false,'code','validation','message','Snapshot cutoff mismatch');
  end if;
  if p_event->>'workspace_id' <> p_workspace or p_event->>'branch_id' <> p_branch->>'id' or p_event->>'type' <> 'branch_created' then raise exception 'Branch event scope mismatch'; end if;
  insert into branches(id,workspace_id,label,parent_branch_id,parent_snapshot_id,mode,base_events)
  values(p_branch->>'id',p_workspace,p_branch->>'label',p_branch->>'parent_branch_id',p_branch->>'parent_snapshot_id',p_branch->>'mode',p_base_events);
  insert into events(id,workspace_id,branch_id,sequence,actor_id,recorded_at,effective_at,type,target_refs,evidence_refs,reason,payload,idempotency_key)
  values(p_event->>'id',p_workspace,p_branch->>'id',jsonb_array_length(p_base_events)+1,p_event->>'actor_id',(p_event->>'recorded_at')::timestamptz,(p_event->>'effective_at')::timestamptz,'branch_created',p_event->'target_refs',p_event->'evidence_refs',p_event->>'reason',p_event->'payload',p_event->>'idempotency_key') returning * into saved;
  return jsonb_build_object('ok',true,'deduped',false,'events',jsonb_build_array(to_jsonb(saved)));
end;
$$;
revoke all on function create_workspace_branch(text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function create_workspace_branch(text,jsonb,jsonb,jsonb) to service_role;
