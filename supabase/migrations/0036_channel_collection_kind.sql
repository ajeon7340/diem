-- Commit the enum value before using it in subsequent migration functions.
alter type public.analysis_job_kind add value if not exists 'collect_channel';
