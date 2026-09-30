-- An optional student-written note alongside each reminder.
alter table reminders
  add column message text,
  add constraint reminders_message_length check (message is null or char_length(message) <= 500);
