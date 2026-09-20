\set ON_ERROR_STOP on
begin;
-- A commit payload shaped the way the worker sends one. The not-null jsonb
-- columns are part of `commit_channel_collection`'s contract, so a probe that
-- omitted them would fail on the schema rather than on the guard it is testing.
create function pg_temp.report(channel text, title text) returns jsonb language sql as $$
 select jsonb_build_object('channel_id',channel,'title',title,'output_stats','[]'::jsonb,
  'promotions','[]'::jsonb,'comment_coverage','{}'::jsonb,'comments_analyzed',0,
  'data_fetched_at',now(),'evidence',jsonb_build_object('windowDays',90));
$$;
create function pg_temp.assert_ok(ok boolean,label text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'FAIL %',label; end if; raise notice 'ok %',label; end $$;
do $$
declare ua uuid; ub uuid; oa uuid; ob uuid; ca uuid; cb uuid; token_a uuid; n integer; failed boolean; first_job boolean; second_job boolean; classify_job uuid; source_at timestamptz;
begin
 insert into auth.users default values returning id into ua;
 insert into auth.users default values returning id into ub;
 insert into organizations(name) values('Flow A') returning id into oa;
 insert into organizations(name) values('Flow B') returning id into ob;
 insert into organization_members(organization_id,user_id,role) values(oa,ua,'owner'),(ob,ub,'owner');
 insert into campaigns(organization_id,created_by,name) values(oa,ua,'Flow A') returning id into ca;
 insert into campaigns(organization_id,created_by,name) values(ob,ub,'Flow B') returning id into cb;
 insert into channel_analyses(channel_id,title,evidence) values('UCflow','Flow','{"windowDays":90}');
 insert into channel_analyses(channel_id,title,data_fetched_at) values('UCexpired','Expired',now()-interval '31 days');
 insert into workspace_channels values(oa,'UCflow',now());
 insert into report_shares(organization_id,channel_id) values(oa,'UCflow') returning token into token_a;
 perform pg_temp.assert_ok((select not include_notes and not include_budget and not include_fee from report_shares where token=token_a),'sharing defaults to public report only');
 first_job:=queue_channel_collection('UCqueued',90,false);
 second_job:=queue_channel_collection('UCqueued',90,false);
 perform pg_temp.assert_ok(first_job and not second_job,'duplicate submissions queue exactly one durable job');
 perform pg_temp.assert_ok(not queue_channel_collection('UCflow',0,false),'campaign reuse does not recollect valid data');
 insert into analysis_jobs(channel_id,kind,status,worker,leased_until) values('UCflow','classify_intent','running','probe-worker',now()+interval '5 minutes') returning id into classify_job;
 select data_fetched_at into source_at from channel_analyses where channel_id='UCflow';
 perform pg_temp.assert_ok(not commit_channel_classification(classify_job,'old-worker',source_at,'{}'),'expired worker cannot publish');
 perform pg_temp.assert_ok(not commit_channel_classification(classify_job,'probe-worker',source_at-interval '1 second','{}'),'old source snapshot cannot publish');
 perform pg_temp.assert_ok(commit_channel_classification(classify_job,'probe-worker',source_at,'{"top_comment_clusters":[],"comments_analyzed":0}'),'current lease can publish against exact source snapshot');

 insert into campaign_candidates(campaign_id,channel_id,fit_summary) values(ca,'UCflow','{"verdict":"old brief"}');
 update campaigns set product='New brief' where id=ca;
 perform pg_temp.assert_ok((select fit_summary is null from campaign_candidates where campaign_id=ca),'brief change invalidates only private fit');
 perform pg_temp.assert_ok((select count(*)=1 from channel_analyses where channel_id='UCflow'),'brief change retains shared data');
 for i in 1..4 loop insert into campaign_candidates(campaign_id,channel_id)values(ca,'UCcandidate'||i);end loop;
 failed:=false;begin insert into campaign_candidates(campaign_id,channel_id)values(ca,'UCsixth');exception when check_violation then failed:=true;end;
 perform pg_temp.assert_ok(failed,'sixth candidate rejected by database');
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',ub::text,true);
 select count(*) into n from workspace_channels where organization_id=oa;
 perform pg_temp.assert_ok(n=0,'other workspace references are invisible');
 select count(*) into n from report_shares where token=token_a;
 perform pg_temp.assert_ok(n=0,'other workspace share credentials are invisible');
 select count(*) into n from channel_analyses where channel_id='UCexpired';
 perform pg_temp.assert_ok(n=0,'expired source data is unservable through RLS');
 failed:=false;begin insert into workspace_channels(organization_id,channel_id)values(oa,'UCintruder');exception when insufficient_privilege then failed:=true;end;
 perform pg_temp.assert_ok(failed,'cannot save to another workspace');
 perform set_config('request.jwt.claim.sub',ua::text,true);
 failed:=false;begin insert into report_shares(organization_id,channel_id,campaign_id,include_notes)values(oa,'UCflow',cb,true);exception when insufficient_privilege then failed:=true;end;
 perform pg_temp.assert_ok(failed,'cannot share another workspace campaign details');
 delete from report_shares where token=token_a;
 perform pg_temp.assert_ok(not exists(select 1 from report_shares where token=token_a),'authorized member revokes share');
 reset role;
 perform pg_temp.assert_ok(not has_function_privilege('authenticated','public.queue_channel_collection(text,integer,boolean)','execute'),'clients cannot bypass queue authorization');
 perform pg_temp.assert_ok(to_regclass('public.creators') is not null,'legacy creator data schema preserved');

 -- ---------------------------------------------------------------------
 -- Workspace setup persists both answers, and only the two
 --
 -- Onboarding asks for a name and brand-or-agency and nothing else. Both have
 -- to survive the round trip, because the whole point of asking so little is
 -- that what little is asked actually sticks.
 -- ---------------------------------------------------------------------
 update organizations set customer_type='agency' where id=oa;
 perform pg_temp.assert_ok(
  (select customer_type from organizations where id=oa)='agency',
  'customer type persists');

 failed:=false;
 begin update organizations set customer_type='influencer' where id=oa;
 exception when check_violation then failed:=true; end;
 perform pg_temp.assert_ok(failed,'and only brand or agency is accepted');

 -- Nothing else is required to have a usable workspace: the campaign created
 -- at the top of this probe carries no budget, objective or brief.
 perform pg_temp.assert_ok(
  (select count(*) from campaigns where organization_id=oa and budget_total is null)>=1,
  'a workspace works with no budget or campaign detail');

 -- ---------------------------------------------------------------------
 -- Viewing an existing report saves it without collecting again
 --
 -- The confirmation screen offers View report when current data exists. That
 -- path must add the channel to the workspace and queue NOTHING — re-collecting
 -- a channel somebody just asked to look at is the exact waste the shared cache
 -- exists to avoid, and it would also reset the report they wanted to read.
 -- ---------------------------------------------------------------------
 -- `evidence.windowDays` is part of what makes a snapshot reusable: a request
 -- for 90 days must not be answered from a 30-day collection, so the fixture
 -- has to carry the period it was collected over.
 insert into channel_analyses(channel_id,title,data_fetched_at,evidence)
  values('UCreuse','Reuse',now(),'{"windowDays":90}');
 insert into workspace_channels values(oa,'UCreuse',now())
  on conflict (organization_id,channel_id) do nothing;
 insert into workspace_channels values(oa,'UCreuse',now())
  on conflict (organization_id,channel_id) do nothing;
 perform pg_temp.assert_ok(
  (select count(*) from workspace_channels where organization_id=oa and channel_id='UCreuse')=1,
  'saving a channel twice keeps one reference');
 perform pg_temp.assert_ok(
  not exists(select 1 from analysis_jobs where channel_id='UCreuse'),
  'and viewing an existing report queues no collection');

 -- The same channel in a second workspace is a second reference to one shared
 -- report, not a second collection.
 insert into workspace_channels values(ob,'UCreuse',now());
 perform pg_temp.assert_ok(
  (select count(*) from workspace_channels where channel_id='UCreuse')=2,
  'two workspaces reference one report');
 perform pg_temp.assert_ok(
  (select count(*) from channel_analyses where channel_id='UCreuse')=1,
  'and the report itself is stored once');

 -- Current data also suppresses a fresh request at the queue, not only in the
 -- interface — a second browser tab must not be able to start one.
 perform pg_temp.assert_ok(
  not queue_channel_collection('UCreuse',90,false),
  'current data suppresses a duplicate collection request');
 perform pg_temp.assert_ok(
  queue_channel_collection('UCreuse',90,true),
  'but an explicit refresh is honoured');

 -- Reuse is period-aware. A different window is a different question and has
 -- to be collected, however current the stored snapshot is.
 update analysis_jobs set status='succeeded',finished_at=now() where channel_id='UCreuse';
 perform pg_temp.assert_ok(
  queue_channel_collection('UCreuse',30,false),
  'a different period is collected rather than reused');

 -- ---------------------------------------------------------------------
 -- Failure recovery
 -- ---------------------------------------------------------------------
 insert into channel_analyses(channel_id,title) values('UCrecover','Recover');
 insert into analysis_jobs(channel_id,kind,status,finished_at,last_error)
  values('UCrecover','collect_channel','failed',now(),'quota exceeded');
 perform pg_temp.assert_ok(
  queue_channel_collection('UCrecover',90,true),
  'a failed collection can be started again');
 perform pg_temp.assert_ok(
  (select count(*) from analysis_jobs where channel_id='UCrecover' and status='failed')=1,
  'and the failure is kept as history rather than overwritten');

 -- ---------------------------------------------------------------------
 -- A worker that lost its lease must not overwrite a newer result
 --
 -- The classify passes check `stillMine` BETWEEN batches, which bounds what a
 -- dead worker spends but says nothing about its final write. The write is the
 -- dangerous half: a worker paused for twenty minutes wakes with a snapshot of
 -- a channel as it was, and clobbering the fresher one loses real work and
 -- resets `analysed_at` to a corpus nobody holds any more.
 -- `commit_channel_collection` is the only path in, and it re-checks identity,
 -- status, lease and channel binding under `for update`.
 -- ---------------------------------------------------------------------
 insert into channel_analyses(channel_id,title) values('UCrace','Race');
 insert into analysis_jobs(channel_id,kind,status,worker,leased_until,started_at)
  values('UCrace','collect_channel','running','worker-live',now()+interval '10 minutes',now())
  returning id into classify_job;

 perform pg_temp.assert_ok(
  not commit_channel_collection(classify_job,'worker-other',
   pg_temp.report('UCrace','Stolen')),
  'a different worker cannot commit a job it does not hold');

 perform pg_temp.assert_ok(
  not commit_channel_collection(classify_job,'worker-live',
   pg_temp.report('UCsomethingelse','Wrong channel')),
  'a worker cannot commit a report for another channel');

 -- Same worker, same job, but the lease lapsed while it was away.
 update analysis_jobs set leased_until=now()-interval '1 second' where id=classify_job;
 perform pg_temp.assert_ok(
  not commit_channel_collection(classify_job,'worker-live',
   pg_temp.report('UCrace','Stale')),
  'an expired lease cannot commit at all');

 perform pg_temp.assert_ok(
  (select title from channel_analyses where channel_id='UCrace')='Race',
  'and the newer row is left exactly as it was');

 -- The holder with a live lease still commits, or the guard above would be
 -- indistinguishable from a function that never works.
 update analysis_jobs set leased_until=now()+interval '10 minutes' where id=classify_job;
 perform pg_temp.assert_ok(
  commit_channel_collection(classify_job,'worker-live',
   pg_temp.report('UCrace','Committed')),
  'the lease holder does commit');
 perform pg_temp.assert_ok(
  (select title from channel_analyses where channel_id='UCrace')='Committed',
  'and the row is replaced by its result');

 -- ---------------------------------------------------------------------
 -- Failed-only retry reuses completed work
 --
 -- The selection lives in `retryChannel`, which requeues only the newest job
 -- per kind when that job FAILED. What the database has to guarantee is the
 -- other half: that a terminal job frees the slot so the retry can be queued,
 -- while a succeeded one is never re-run just because a sibling pass failed.
 -- ---------------------------------------------------------------------
 insert into analysis_jobs(channel_id,kind,status,finished_at,comments_scanned)
  values('UCretry','collect_channel','succeeded',now(),600);
 insert into analysis_jobs(channel_id,kind,status,finished_at,last_error)
  values('UCretry','classify_intent','failed',now(),'probe');

 insert into analysis_jobs(channel_id,kind) values('UCretry','classify_intent');
 perform pg_temp.assert_ok(
  (select count(*) from analysis_jobs where channel_id='UCretry' and kind='classify_intent')=2,
  'the failed pass can be queued again');

 failed:=false;
 begin
  insert into analysis_jobs(channel_id,kind) values('UCretry','classify_intent');
 exception when unique_violation then failed:=true; end;
 perform pg_temp.assert_ok(failed,'but only once while it is live');

 perform pg_temp.assert_ok(
  (select count(*) from analysis_jobs where channel_id='UCretry' and kind='collect_channel')=1,
  'and the completed collection is not re-run');

 -- ---------------------------------------------------------------------
 -- Retention reaches private derived work and shared links, not just evidence
 --
 -- Three different owners on one clock. Deleting the public snapshot while
 -- leaving a share pointing at it, or a written fit derived from it, keeps
 -- exactly the records the horizon exists to remove.
 -- ---------------------------------------------------------------------
 insert into channel_analyses(channel_id,title,data_fetched_at)
  values('UCsweep','Sweep',now()-interval '31 days');
 -- The five-candidate limit is asserted above and is still in force here, so
 -- this makes room rather than raising the cap for its own convenience.
 delete from campaign_candidates where campaign_id=ca
  and id=(select id from campaign_candidates where campaign_id=ca order by added_at desc limit 1);
 insert into campaign_candidates(campaign_id,channel_id,fit_summary,fit_written_at)
  values(ca,'UCsweep','{"verdict":"stale"}',now()-interval '31 days');
 -- A share can only point at a channel the workspace actually saved — the
 -- composite foreign key enforces it, so the fixture has to be honest about
 -- that too rather than inserting a share out of nowhere.
 insert into workspace_channels values(oa,'UCsweep',now());
 insert into report_shares(organization_id,channel_id,expires_at)
  values(oa,'UCsweep',now()-interval '1 day');

 perform pg_temp.assert_ok(
  exists(select 1 from campaign_candidates where channel_id='UCsweep' and fit_summary is not null),
  'a derived fit outlives its source until the sweep runs');
 perform pg_temp.assert_ok(
  exists(select 1 from report_shares where channel_id='UCsweep' and expires_at < now()),
  'and so does an expired share row');

 -- Which is why the READ path, not the sweep, is what protects the deadline:
 -- the sweep can be late, and these rows are what "late" looks like.
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',ua::text,true);
 select count(*) into n from channel_analyses where channel_id='UCsweep';
 perform pg_temp.assert_ok(n=0,'an expired snapshot is already unreadable, swept or not');
 reset role;
end $$;
rollback;
