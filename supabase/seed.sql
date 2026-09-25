-- Local development data. Applied by `supabase start` and `supabase db reset` only; deployments
-- run `supabase db push`, which never reads this file.
--
-- Every date is an offset from current_date so the data keeps its meaning whenever it is
-- replayed: running contracts stay running, past deadlines stay past, and the derived on-time
-- and productivity figures do not drift as the calendar moves.
--
-- Twelve creators, shaped to cover what the admin table has to render: running, finished and
-- upcoming contracts, a renewal, a contract ending today, revoked access, no contract at all,
-- all three productivity bands, a creator with nothing resolved yet, and enough rows for a
-- second page.

begin;

insert into users (email, is_admin) values
  ('admin@tofly.id',     true),
  ('rangga@example.com', false),
  ('dimas@example.com',  false),
  ('nabila@example.com', false),
  ('salsa@example.com',  false),
  ('yusuf@example.com',  false),
  ('farah@example.com',  false),
  ('bagas@example.com',  false),
  ('intan@example.com',  false),
  ('reza@example.com',   false),
  ('kirana@example.com', false),
  ('adit@example.com',   false),
  ('melati@example.com', false);

insert into creators (user_id, first_name, middle_name, last_name, phone_number, access_revoke_date)
select u.id, v.first_name, v.middle_name, v.last_name, v.phone_number,
       case when v.revoke_offset is null then null else current_date + v.revoke_offset end
from (values
  ('rangga@example.com', 'Rangga', null,    'Pratama',   '081234567001', null),
  ('dimas@example.com',  'Dimas',  null,    'Aji',       '081234567002', null),
  ('nabila@example.com', 'Nabila', null,    'Putri',     '081234567003', null),
  ('salsa@example.com',  'Salsa',  null,    'Amelia',    '081234567004', null),
  ('yusuf@example.com',  'Yusuf',  null,    'Hakim',     '081234567005', null),
  ('farah@example.com',  'Farah',  'Nur',   'Aini',      '081234567006', null),
  ('bagas@example.com',  'Bagas',  null,    'Wicaksono', '081234567007', null),
  ('intan@example.com',  'Intan',  null,    'Maharani',  '081234567008', null),
  ('reza@example.com',   'Reza',   'Aulia', 'Mahendra',  '081234567009', null),
  ('kirana@example.com', 'Kirana', null,    'Dewi',      '081234567010', -14),
  ('adit@example.com',   'Adit',   null,    'Prakoso',   '081234567011', null),
  ('melati@example.com', 'Melati', null,    'Sari',      '081234567012', null)
) as v (email, first_name, middle_name, last_name, phone_number, revoke_offset)
join users u on u.email = v.email;

insert into social_accounts (creator_id, platform, username, is_connected)
select c.id, v.platform::social_platform, v.username, v.is_connected
from (values
  ('rangga@example.com', 'instagram', 'rangga.creates', true),
  ('rangga@example.com', 'tiktok',    'ranggacreates',  true),
  ('dimas@example.com',  'instagram', 'dimasaji',       true),
  ('nabila@example.com', 'instagram', 'nabilaputri',    true),
  ('nabila@example.com', 'tiktok',    'nabila.putri',   false),
  ('salsa@example.com',  'instagram', 'salsa.amelia',   true),
  ('yusuf@example.com',  'instagram', 'yusufhakim',     false),
  ('farah@example.com',  'instagram', 'farah.nuraini',  true),
  ('farah@example.com',  'tiktok',    'farahnuraini',   true),
  ('bagas@example.com',  'tiktok',    'bagaswicaksono', true),
  ('intan@example.com',  'instagram', 'intan.maharani', false),
  ('reza@example.com',   'instagram', 'rezamahendra',   true),
  ('kirana@example.com', 'instagram', 'kirana.dewi',    true),
  ('adit@example.com',   'instagram', 'aditprakoso',    false),
  ('melati@example.com', 'instagram', 'melati.sari',    true)
) as v (email, platform, username, is_connected)
join users u on u.email = v.email
join creators c on c.user_id = u.id;

-- Salsa and Adit carry two rows each: a finished period and the one that followed it.
-- Melati has none. Reza's ends today. Farah's has not started yet. Newcomers Farah and Bagas,
-- and Salsa's first period, are on probation; everyone else is regular.
insert into contracts (creator_id, start_date, end_date, days_between, content_quota, fixed_rate,
                       contract_type)
select c.id, current_date + v.start_offset, current_date + v.end_offset,
       v.days_between, v.content_quota, v.fixed_rate, v.contract_type::contract_type
from (values
  ('rangga@example.com', -100,   80, 14, 6, 500000, 'regular'),
  ('dimas@example.com',   -90,   90, 14, 6, 450000, 'regular'),
  ('nabila@example.com',  -75,  105, 14, 6, 450000, 'regular'),
  ('salsa@example.com',  -400,  -40, 14, 6, 400000, 'probation'),
  ('salsa@example.com',   -30,  150, 14, 6, 550000, 'regular'),
  ('yusuf@example.com',  -200,  -20, 14, 6, 400000, 'regular'),
  ('farah@example.com',    10,  190, 14, 6, 500000, 'probation'),
  ('bagas@example.com',   -10,  170, 14, 6, 450000, 'probation'),
  ('intan@example.com',  -120,   60, 14, 6, 600000, 'regular'),
  ('reza@example.com',   -180,    0, 14, 6, 500000, 'regular'),
  ('kirana@example.com', -240,  -60, 14, 6, 450000, 'regular'),
  ('adit@example.com',   -420,  -240, 14, 6, 400000, 'regular'),
  ('adit@example.com',   -230,  -50, 14, 6, 400000, 'regular')
) as v (email, start_offset, end_offset, days_between, content_quota, fixed_rate, contract_type)
join users u on u.email = v.email
join creators c on c.user_id = u.id;

-- Content is attached to a creator's contract by the contract's end offset. A submitted video
-- carries both the link and the day it was handed in; on time or late is worked out from the
-- deadline on read. The draft_count column drives the submissions table below.
create temporary table seed_contents (
  email          text,
  contract_end   integer,
  name           text,
  type           text,
  deadline       integer,
  status         text,
  submitted      integer,
  is_proposal    boolean,
  draft_count    integer
) on commit drop;

insert into seed_contents values
  -- Rangga: four on time, one late, one open → on time 80 %, revisions 0 → Baik.
  ('rangga@example.com',  80, 'Unboxing paket Tofly',          'evergreen', -86, 'link_submitted', -88, false, 1),
  ('rangga@example.com',  80, 'Tips packing hemat',            'evergreen', -72, 'link_submitted', -72, false, 1),
  ('rangga@example.com',  80, 'Review layanan same-day',       'specific',  -58, 'link_submitted', -60, false, 1),
  ('rangga@example.com',  80, 'Cara lacak paket',              'evergreen', -44, 'link_submitted', -41, false, 1),
  ('rangga@example.com',  80, 'Promo akhir bulan',             'specific',  -30, 'link_submitted', -31, false, 1),
  ('rangga@example.com',  80, 'Tofly untuk UMKM',              'evergreen',  20, 'draft_review',   null, false, 1),
  -- Dimas: one on time, two late, one missed → on time 25 %, revisions 3 → Berisiko.
  ('dimas@example.com',   90, 'Kenalan dengan Tofly',          'evergreen', -76, 'link_submitted', -70, false, 4),
  ('dimas@example.com',   90, 'Kirim paket antar kota',        'evergreen', -62, 'link_submitted', -62, false, 3),
  ('dimas@example.com',   90, 'Asuransi pengiriman',           'specific',  -48, 'link_submitted', -40, false, 4),
  ('dimas@example.com',   90, 'Tarif flat se-Jawa',            'specific',  -34, 'draft_revision', null, false, 3),
  ('dimas@example.com',   90, 'Drop point terdekat',           'evergreen',  30, 'scheduled',      null, false, 0),
  -- Nabila: three on time, two late → on time 60 %, revisions 1,5 → Perlu Perhatian.
  ('nabila@example.com', 105, 'Haul belanja online',           'evergreen', -61, 'link_submitted', -61, false, 2),
  ('nabila@example.com', 105, 'Paket sampai cepat',            'evergreen', -47, 'link_submitted', -49, false, 1),
  ('nabila@example.com', 105, 'Kirim hadiah ke luar kota',     'specific',  -33, 'link_submitted', -30, false, 2),
  ('nabila@example.com', 105, 'Bungkus paket aman',            'evergreen', -19, 'link_submitted', -19, false, 1),
  ('nabila@example.com', 105, 'Tofly COD',                     'specific',   -5, 'link_submitted',  -3, false, 0),
  ('nabila@example.com', 105, 'Jadwal pickup',                 'evergreen',  23, 'scheduled',      null, false, 0),
  -- Salsa: finished first period, plus a running second one with one delivery so far.
  ('salsa@example.com',  -40, 'Pengalaman pertama Tofly',      'evergreen', -380, 'link_submitted', -380, false, 1),
  ('salsa@example.com',  -40, 'Kirim paket pecah belah',       'evergreen', -300, 'link_submitted', -302, false, 2),
  ('salsa@example.com',  -40, 'Tofly di hari libur',           'specific',  -200, 'link_submitted', -195, false, 1),
  ('salsa@example.com',  150, 'Kembali bersama Tofly',         'evergreen',  -16, 'link_submitted',  -17, false, 1),
  ('salsa@example.com',  150, 'Paket ke pelosok',              'evergreen',   -2, 'link_submitted',  -2, false, 1),
  ('salsa@example.com',  150, 'Kirim dokumen penting',         'specific',    12, 'draft_approved', null, false, 1),
  -- Yusuf: finished contract, everything delivered, one late → Baik.
  ('yusuf@example.com',  -20, 'Tofly untuk reseller',          'evergreen', -180, 'link_submitted', -181, false, 1),
  ('yusuf@example.com',  -20, 'Cek ongkir',                    'evergreen', -150, 'link_submitted', -150, false, 1),
  ('yusuf@example.com',  -20, 'Kirim banyak paket sekaligus',  'specific',  -120, 'link_submitted', -118, false, 1),
  ('yusuf@example.com',  -20, 'Paket tiba sebelum lebaran',    'specific',   -90, 'link_submitted',  -91, false, 1),
  ('yusuf@example.com',  -20, 'Tofly Points',                  'evergreen',  -60, 'link_submitted',  -60, false, 1),
  ('yusuf@example.com',  -20, 'Layanan retur',                 'evergreen',  -30, 'link_submitted',  -30, false, 2),
  -- Farah: contract has not started; nothing assigned yet.
  -- Bagas: running contract, deadlines all ahead, no drafts yet → Belum Ada Data.
  ('bagas@example.com',  170, 'Halo dari Bagas',               'evergreen',   4, 'scheduled', null, false, 0),
  ('bagas@example.com',  170, 'Kirim paket olahraga',          'evergreen',  18, 'scheduled', null, false, 0),
  ('bagas@example.com',  170, 'Tofly x komunitas lari',        'specific',   32, 'scheduled', null, false, 0),
  -- Intan: all on time, one proposal that must not count → Baik.
  ('intan@example.com',   60, 'Skincare haul',                 'evergreen', -106, 'link_submitted', -107, false, 1),
  ('intan@example.com',   60, 'Kirim paket rapuh',             'evergreen',  -92, 'link_submitted',  -92, false, 1),
  ('intan@example.com',   60, 'Tofly untuk toko online',       'specific',   -78, 'link_submitted',  -80, false, 2),
  ('intan@example.com',   60, 'Cara klaim asuransi',           'specific',   -64, 'link_submitted',  -64, false, 1),
  ('intan@example.com',   60, 'Behind the scene packing',      'evergreen',  -50, 'link_submitted',  -52, false, 1),
  ('intan@example.com',   60, 'Ide konten dari Intan',         'specific',   -10, 'scheduled',      null, true,  0),
  ('intan@example.com',   60, 'Tofly untuk pemula',            'evergreen',   14, 'draft_review',   null, false, 1),
  -- Reza: contract ends today; two late on the way → Perlu Perhatian.
  ('reza@example.com',     0, 'Perkenalan Reza',               'evergreen', -166, 'link_submitted', -166, false, 1),
  ('reza@example.com',     0, 'Paket besar kirim mudah',       'evergreen', -138, 'link_submitted', -135, false, 2),
  ('reza@example.com',     0, 'Cek status kiriman',            'specific',  -110, 'link_submitted', -110, false, 1),
  ('reza@example.com',     0, 'Kirim motor lewat Tofly',       'specific',   -82, 'link_submitted',  -79, false, 1),
  ('reza@example.com',     0, 'Layanan kargo',                 'evergreen',  -54, 'link_submitted',  -54, false, 2),
  ('reza@example.com',     0, 'Ucapan terima kasih',           'evergreen',  -26, 'link_submitted',  -26, false, 1),
  -- Kirana: finished contract, access already revoked, one missed delivery.
  ('kirana@example.com', -60, 'Halo dari Kirana',              'evergreen', -226, 'link_submitted', -226, false, 1),
  ('kirana@example.com', -60, 'Kirim paket makanan',           'evergreen', -198, 'link_submitted', -198, false, 1),
  ('kirana@example.com', -60, 'Tofly untuk mahasiswa',         'specific',  -170, 'link_submitted', -172, false, 1),
  ('kirana@example.com', -60, 'Packing kado',                  'evergreen', -142, 'link_submitted', -140, false, 1),
  ('kirana@example.com', -60, 'Promo 11.11',                   'specific',  -114, 'link_submitted', -114, false, 2),
  ('kirana@example.com', -60, 'Salam perpisahan',              'evergreen',  -86, 'draft_revised',  null, false, 2),
  -- Adit: two finished periods; the later one went badly → Berisiko.
  ('adit@example.com',  -240, 'Perkenalan Adit',               'evergreen', -406, 'link_submitted', -406, false, 1),
  ('adit@example.com',  -240, 'Kirim paket ke kampung',        'evergreen', -350, 'link_submitted', -352, false, 1),
  ('adit@example.com',  -240, 'Tofly saat musim hujan',        'specific',  -290, 'link_submitted', -288, false, 1),
  ('adit@example.com',   -50, 'Kembali lagi',                  'evergreen', -216, 'link_submitted', -205, false, 3),
  ('adit@example.com',   -50, 'Kirim paket elektronik',        'evergreen', -188, 'link_submitted', -180, false, 4),
  ('adit@example.com',   -50, 'Tofly untuk kantor',            'specific',  -160, 'draft_revision', null, false, 3),
  ('adit@example.com',   -50, 'Diskon pengguna baru',          'specific',  -132, 'scheduled',      null, false, 0);

insert into contents (contract_id, name, type, deadline, status, is_proposal, video_link, video_submitted_at)
select k.id,
       s.name,
       s.type::content_type,
       current_date + s.deadline,
       s.status::content_status,
       s.is_proposal,
       case when s.submitted is null then null
            else 'https://example.com/video/' || lower(regexp_replace(s.name, '[^A-Za-z0-9]+', '-', 'g')) end,
       case when s.submitted is null then null else current_date + s.submitted end
from seed_contents s
join users u on u.email = s.email
join creators c on c.user_id = u.id
join contracts k on k.creator_id = c.id and k.end_date = current_date + s.contract_end;

-- One submission row per draft handed in; the first is the original, the rest are revisions.
-- Spread over successive days so the order of hand-ins is unambiguous.
insert into submissions (content_id, creator_id, link, revision_notes, created_at)
select n.id,
       k.creator_id,
       'https://example.com/draft/' || lower(regexp_replace(s.name, '[^A-Za-z0-9]+', '-', 'g')) || '-' || g.n,
       case when g.n = 1 then null else 'Revisi ke-' || (g.n - 1) end,
       (current_date + s.deadline - 7 + g.n)::timestamptz
from seed_contents s
join users u on u.email = s.email
join creators c on c.user_id = u.id
join contracts k on k.creator_id = c.id and k.end_date = current_date + s.contract_end
join contents n on n.contract_id = k.id and n.name = s.name
cross join lateral generate_series(1, s.draft_count) as g (n);

commit;
