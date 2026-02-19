-- Ensure chat message TTL cleanup runs hourly.
-- Keeps brand_profiles.chat_messages bounded to the most recent 24 hours.
do $migration$
declare
  existing_job record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid
      from cron.job
      where jobname = 'cleanup-old-chat-messages'
    loop
      perform cron.unschedule(existing_job.jobid);
    end loop;

    perform cron.schedule(
      'cleanup-old-chat-messages',
      '0 * * * *',
      $job$select brand_profiles.cleanup_old_chat_messages()$job$
    );
  end if;
end
$migration$;
