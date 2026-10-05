-- Web sitesi sohbet kanalı (widget) ve web formu: channel_accounts.channel 'web'
alter table channel_accounts drop constraint if exists channel_accounts_channel_check;
alter table channel_accounts add constraint channel_accounts_channel_check check (channel in ('whatsapp','instagram','messenger','email','sms','telegram','web'));
