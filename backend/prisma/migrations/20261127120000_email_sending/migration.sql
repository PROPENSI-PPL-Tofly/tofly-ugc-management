-- PBI-11 follow-up (review on #253, AC 8): a row is marked sending just before the mail server is
-- asked. A row left sending may already have gone out, so the 08:00 run closes it instead of
-- sending it again, while a row still pending never reached the mail server and may be retried.
alter type email_status add value 'sending' after 'pending';
