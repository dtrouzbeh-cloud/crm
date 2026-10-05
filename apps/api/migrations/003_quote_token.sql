-- Personelin teklif bağlantısını sonradan tekrar kopyalayabilmesi için token şifreli saklanır (hash ile doğrulama sürer)
alter table quotes add column if not exists token_enc text;
alter table quotes add column if not exists revoked_at timestamptz;
