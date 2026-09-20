-- Additive: public-source cache and private workspace references stay separate.
alter table public.organizations add column if not exists customer_type text
  check (customer_type in ('brand', 'agency'));
grant update (customer_type) on public.organizations to authenticated;
alter table public.channel_analyses add column if not exists evidence jsonb;
alter table public.channel_analyses add column if not exists comment_corpus jsonb;
alter table public.channel_analyses add column if not exists intent_rubric_version text;
alter table public.campaigns add column if not exists use_case text check (char_length(use_case) <= 2000);
grant insert (use_case), update (use_case) on public.campaigns to authenticated;
alter table public.campaign_candidates drop constraint if exists campaign_candidates_status_check;
alter table public.campaign_candidates add constraint campaign_candidates_status_check
  check (status in ('considering','shortlisted','hold','rejected'));

create table public.workspace_channels (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, channel_id)
);
alter table public.workspace_channels enable row level security;
create policy workspace_channels_members on public.workspace_channels for all to authenticated
 using (organization_id in (select public.user_org_ids()))
 with check (organization_id in (select public.user_org_ids()));
grant select, insert, delete on public.workspace_channels to authenticated;
grant all on public.workspace_channels to service_role;
create policy analysis_jobs_workspace_read on public.analysis_jobs for select to authenticated
 using (exists (select 1 from public.workspace_channels w where w.channel_id = analysis_jobs.channel_id
   and w.organization_id in (select public.user_org_ids())));

-- Serialize additions on their parent row, including direct REST inserts.
create function public.limit_campaign_candidates() returns trigger language plpgsql set search_path = public as $$
begin
 perform 1 from public.campaigns where id = new.campaign_id for update;
 if (select count(*) from public.campaign_candidates where campaign_id = new.campaign_id and id <> new.id) >= 5 then
  raise exception 'candidate_limit' using errcode = '23514';
 end if;
 return new;
end $$;
create trigger campaign_candidate_limit before insert or update of campaign_id on public.campaign_candidates
 for each row execute function public.limit_campaign_candidates();

create table public.report_shares (
 token uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 channel_id text not null,
 campaign_id uuid references public.campaigns(id) on delete cascade,
 include_notes boolean not null default false,
 include_budget boolean not null default false,
 include_fee boolean not null default false,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '7 days',
 foreign key (organization_id,channel_id) references public.workspace_channels on delete cascade
);
alter table public.report_shares enable row level security;
create policy report_shares_members on public.report_shares for all to authenticated
 using (organization_id in (select public.user_org_ids()))
 with check (organization_id in (select public.user_org_ids()) and expires_at <= now() + interval '30 days'
 and (campaign_id is null or exists (select 1 from public.campaigns c where c.id = campaign_id and c.organization_id = report_shares.organization_id)));
grant select, insert, delete on public.report_shares to authenticated;
grant all on public.report_shares to service_role;

-- Stale public source content is unservable even if the retention worker misses a run.
drop policy channel_analyses_read on public.channel_analyses;
create policy channel_analyses_read on public.channel_analyses for select to authenticated
 using (data_fetched_at > now() - interval '30 days');

-- A lease owner commits the complete snapshot atomically. An expired worker cannot
-- replace a newer result. The shared record never includes a workspace brief.
create function public.commit_channel_collection(p_job uuid, p_worker text, p_report jsonb)
 returns boolean language plpgsql security definer set search_path = public as $$
declare j public.analysis_jobs; r public.channel_analyses;
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if j.id is null or j.worker is distinct from p_worker or j.status <> 'running'
   or j.leased_until <= now() or j.channel_id is distinct from p_report->>'channel_id' then return false; end if;
 r := jsonb_populate_record(null::public.channel_analyses, p_report);
 insert into public.channel_analyses(channel_id,title,handle,avatar_url,description,subscribers,
 output_stats,promotions,comment_coverage,comments_analyzed,data_fetched_at,evidence,comment_corpus)
 values (r.channel_id,r.title,r.handle,r.avatar_url,r.description,r.subscribers,
 r.output_stats,r.promotions,r.comment_coverage,r.comments_analyzed,r.data_fetched_at,r.evidence,r.comment_corpus)
 on conflict(channel_id) do update set title=excluded.title,handle=excluded.handle,avatar_url=excluded.avatar_url,
 description=excluded.description,subscribers=excluded.subscribers,output_stats=excluded.output_stats,
 promotions=excluded.promotions,comment_coverage=excluded.comment_coverage,comments_analyzed=excluded.comments_analyzed,
 data_fetched_at=excluded.data_fetched_at,evidence=excluded.evidence,comment_corpus=excluded.comment_corpus,
 comment_axes=null,top_comment_clusters='[]',comment_risks='[]',moderation=null,comment_register=null,
 sentiment_score=null,purchase_intent_rate=null,intent_comments_scored=null,analysed_at=null;
 -- Campaign interpretations refer to the previous snapshot and must be regenerated.
 update public.campaign_candidates set fit_summary=null,fit_written_at=null,fit_model=null where channel_id=j.channel_id;
 return true;
end $$;
revoke all on function public.commit_channel_collection(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_channel_collection(uuid,text,jsonb) to service_role;
alter table public.analysis_jobs drop constraint if exists analysis_jobs_progress_stage_check;
alter table public.analysis_jobs add constraint analysis_jobs_progress_stage_check
 check (progress_stage in ('fetching','classifying','storing','resolution','videos','comments','analysis','report'));
create function public.queue_channel_collection(p_channel text, p_days integer default 90, p_refresh boolean default false)
 returns boolean language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(hashtext(p_channel));
 if exists(select 1 from public.analysis_jobs where channel_id=p_channel and status in ('queued','running')) then return false; end if;
 if not p_refresh and exists(select 1 from public.channel_analyses where channel_id=p_channel
  and data_fetched_at > now()-interval '30 days' and (evidence->>'windowDays')::integer=p_days) then return false; end if;
 insert into public.analysis_jobs(channel_id,kind,params) values(p_channel,'collect_channel',jsonb_build_object('windowDays',p_days));
 return true;
end $$;
revoke all on function public.queue_channel_collection(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.queue_channel_collection(text,integer,boolean) to service_role;
