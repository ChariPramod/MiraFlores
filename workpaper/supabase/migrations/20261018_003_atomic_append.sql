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
  select coalesce(max(sequence),0) into current_seq from events where workspace_id = p_workspace and branch_id = p_branch;
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
