-- Local development data. Applied by `supabase start` and `supabase db reset` only;
-- deployments run `supabase db push`, which never touches this file.
--
-- Every date is written as an offset from current_date so the data keeps its meaning
-- whenever it is replayed: contracts stay live, past deadlines stay past, and the derived
-- on-time and productivity numbers do not drift into nonsense over time.
--
-- The twelve creators are shaped to cover the states the admin table has to render:
-- active and expired contracts, renewals (two periods), all three productivity bands, a
-- creator with no resolved work yet, late and overdue content, and enough rows to page.

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

insert into creators (user_id, first_name, middle_name, last_name, phone_number)
select u.id, v.first_name, v.middle_name, v.last_name, v.phone_number
from (values
  ('rangga@example.com', 'Rangga', null,    'Pratama',   '081234567001'),
  ('dimas@example.com',  'Dimas',  null,    'Aji',       '081234567002'),
  ('nabila@example.com', 'Nabila', null,    'Putri',     '081234567003'),
  ('salsa@example.com',  'Salsa',  null,    'Amelia',    '081234567004'),
  ('yusuf@example.com',  'Yusuf',  null,    'Hakim',     '081234567005'),
  ('farah@example.com',  'Farah',  'Nur',   'Aini',      '081234567006'),
  ('bagas@example.com',  'Bagas',  null,    'Wicaksono', '081234567007'),
  ('intan@example.com',  'Intan',  null,    'Maharani',  '081234567008'),
  ('reza@example.com',   'Reza',   'Aulia', 'Mahendra',  '081234567009'),
  ('kirana@example.com', 'Kirana', null,    'Dewi',      '081234567010'),
  ('adit@example.com',   'Adit',   null,    'Prakoso',   '081234567011'),
  ('melati@example.com', 'Melati', null,    'Sari',      '081234567012')
) as v (email, first_name, middle_name, last_name, phone_number)
join users u on u.email = v.email;

insert into social_accounts (creator_id, platform, username, is_connected)
select c.id, v.platform::social_platform, v.username, v.is_connected
from (values
  ('rangga@example.com', 'instagram', 'rangga.creates',  true),
  ('rangga@example.com', 'tiktok',    'ranggacreates',   true),
  ('dimas@example.com',  'instagram', 'dimasaji',        true),
  ('nabila@example.com', 'instagram', 'nabilaputri',     true),
  ('nabila@example.com', 'tiktok',    'nabila.putri',    false),
  ('salsa@example.com',  'instagram', 'salsa.amelia',    true),
  ('yusuf@example.com',  'instagram', 'yusufhakim',      false),
  ('farah@example.com',  'instagram', 'farah.nuraini',   true),
  ('farah@example.com',  'tiktok',    'farahnuraini',    true),
  ('bagas@example.com',  'tiktok',    'bagaswicaksono',  true),
  ('intan@example.com',  'instagram', 'intan.maharani',  false),
  ('reza@example.com',   'instagram', 'rezamahendra',    true),
  ('kirana@example.com', 'instagram', 'kirana.dewi',     true),
  ('kirana@example.com', 'tiktok',    'kiranadewi',      true),
  ('adit@example.com',   'instagram', 'aditprakoso',     false),
  ('melati@example.com', 'instagram', 'melati.sari',     true)
) as v (email, platform, username, is_connected)
join users u on u.email = v.email
join creators c on c.user_id = u.id;

-- Salsa and Adit carry two rows: a finished period plus the one that followed it, which is
-- what the detail view shows as contract history.
insert into contracts (creator_id, start_date, end_date, days_between, content_quota, fixed_rate)
select c.id,
       current_date + v.start_offset,
       current_date + v.end_offset,
       v.days_between,
       v.content_quota,
       v.fixed_rate
from (values
  ('rangga@example.com', -105,  105, 14, 6, 500000),
  ('dimas@example.com',  -120,   60, 21, 5, 500000),
  ('nabila@example.com',  -80,  100, 14, 4, 550000),
  ('salsa@example.com',  -400, -220, 14, 3, 450000),
  ('salsa@example.com',  -210,  -30, 14, 4, 500000),
  ('yusuf@example.com',  -240,  -60, 14, 3, 450000),
  ('farah@example.com',  -150,   90, 14, 6, 600000),
  ('bagas@example.com',  -120,   80, 21, 5, 500000),
  ('intan@example.com',   -20,  160, 14, 4, 500000),
  ('reza@example.com',   -100,   70, 21, 4, 500000),
  ('kirana@example.com', -140,   60, 14, 5, 550000),
  ('adit@example.com',   -380, -200, 21, 2, 400000),
  ('adit@example.com',   -190,  -10, 21, 4, 450000),
  ('melati@example.com', -180,   40, 14, 6, 600000)
) as v (email, start_offset, end_offset, days_between, content_quota, fixed_rate)
join users u on u.email = v.email
join creators c on c.user_id = u.id;

-- The content plan, keyed by contract period (period 1 is that creator's oldest contract).
-- A null submitted_offset means nothing was handed in: past its deadline the content reads
-- as late, before it as still scheduled. submission_count is how many draft rows the
-- content gets, so a count of 2 is one revision.
create temporary table seed_content_plan (
  email            text    not null,
  period           integer not null,
  name             text    not null,
  type             text    not null,
  deadline_offset  integer not null,
  submitted_offset integer,
  submission_count integer not null
) on commit drop;

insert into seed_content_plan values
  ('rangga@example.com', 1, 'Evergreen - Tips Belajar Cepat',       'evergreen',  -90,  -92, 1),
  ('rangga@example.com', 1, 'Evergreen - Rutinitas Pagi Produktif', 'evergreen',  -60,  -62, 1),
  ('rangga@example.com', 1, 'Evergreen - Cara Atur Jadwal Tryout',  'evergreen',  -30,  -35, 2),
  ('rangga@example.com', 1, 'Konten Testimoni Kelas',               'specific',   -10,  -12, 1),
  ('rangga@example.com', 1, 'Evergreen - Review Fitur Tobi AI',     'evergreen',   14, null, 0),
  ('rangga@example.com', 1, 'Evergreen - Tanya Jawab Followers',    'evergreen',   28, null, 0),

  ('dimas@example.com',  1, 'Evergreen - Unboxing Paket Belajar',   'evergreen', -100, -101, 1),
  ('dimas@example.com',  1, 'Evergreen - Day in My Life',           'evergreen',  -70,  -75, 2),
  ('dimas@example.com',  1, 'Video Review Aplikasi',                'specific',   -20, null, 3),
  ('dimas@example.com',  1, 'Evergreen - Tips Fokus Belajar',       'evergreen',   -5, null, 1),
  ('dimas@example.com',  1, 'Evergreen - Rekomendasi Buku',         'evergreen',   21, null, 0),

  ('nabila@example.com', 1, 'Evergreen - Skincare Sambil Belajar',  'evergreen',  -60,  -61, 1),
  ('nabila@example.com', 1, 'Evergreen - Motivasi Ujian',           'evergreen',  -40,  -41, 1),
  ('nabila@example.com', 1, 'Reels Highlight Promo',                'specific',   -20,  -25, 1),
  ('nabila@example.com', 1, 'Evergreen - Tur Kamar Belajar',        'evergreen',   -3,   -1, 2),

  ('salsa@example.com',  1, 'Evergreen - Perkenalan Kelas',         'evergreen', -380, -382, 1),
  ('salsa@example.com',  1, 'Evergreen - Tips Menghafal',           'evergreen', -350, -351, 1),
  ('salsa@example.com',  1, 'Evergreen - Rekap Materi',             'evergreen', -320, -325, 1),
  ('salsa@example.com',  2, 'Evergreen - Kelas TOEFL Batch 1',      'evergreen', -180, -182, 1),
  ('salsa@example.com',  2, 'Evergreen - Kelas TOEFL Batch 2',      'evergreen', -150, -152, 1),
  ('salsa@example.com',  2, 'Evergreen - Tryout Bareng',            'evergreen', -110, -115, 1),
  ('salsa@example.com',  2, 'Konten Penutup Kontrak',               'specific',   -60,  -62, 1),

  ('yusuf@example.com',  1, 'Evergreen - Cerita Kuliah',            'evergreen', -200, -205, 1),
  ('yusuf@example.com',  1, 'Evergreen - Tips Wawancara',           'evergreen', -150, null, 0),
  ('yusuf@example.com',  1, 'Evergreen - Kelas Malam',              'evergreen', -100, null, 0),

  ('farah@example.com',  1, 'Evergreen - Belajar Bahasa Inggris',   'evergreen', -140, -142, 1),
  ('farah@example.com',  1, 'Evergreen - Kosakata Harian',          'evergreen', -110, -111, 1),
  ('farah@example.com',  1, 'Evergreen - Latihan Listening',        'evergreen',  -80,  -85, 2),
  ('farah@example.com',  1, 'Evergreen - Simulasi Speaking',        'evergreen',  -50,  -52, 1),
  ('farah@example.com',  1, 'Kolaborasi Promo Semester',            'specific',   -20,  -22, 1),
  ('farah@example.com',  1, 'Evergreen - Tips Grammar',             'evergreen',   20, null, 0),

  ('bagas@example.com',  1, 'Evergreen - Setup Meja Belajar',       'evergreen',  -90,  -95, 1),
  ('bagas@example.com',  1, 'Evergreen - Review Aplikasi Catatan',  'evergreen',  -60, null, 4),
  ('bagas@example.com',  1, 'Evergreen - Kebiasaan Malas',          'evergreen',  -30, null, 3),
  ('bagas@example.com',  1, 'Konten Promo Diskon',                  'specific',   -10, null, 2),

  ('intan@example.com',  1, 'Evergreen - Perkenalan Diri',          'evergreen',   10, null, 0),
  ('intan@example.com',  1, 'Evergreen - Tips Mencatat',            'evergreen',   24, null, 0),
  ('intan@example.com',  1, 'Evergreen - Rutinitas Belajar',        'evergreen',   38, null, 0),
  ('intan@example.com',  1, 'Evergreen - Tur Aplikasi',             'evergreen',   52, null, 0),

  ('reza@example.com',   1, 'Evergreen - Pengalaman Magang',        'evergreen',  -80,  -82, 3),
  ('reza@example.com',   1, 'Evergreen - Skill Wajib Mahasiswa',    'evergreen',  -50,  -52, 4),
  ('reza@example.com',   1, 'Konten Kolaborasi Kampus',             'specific',   -20, null, 4),
  ('reza@example.com',   1, 'Evergreen - Tips Organisasi',          'evergreen',   15, null, 0),

  ('kirana@example.com', 1, 'Evergreen - Outfit ke Kampus',         'evergreen', -120, -122, 1),
  ('kirana@example.com', 1, 'Evergreen - Bekal Hemat',              'evergreen',  -95,  -96, 1),
  ('kirana@example.com', 1, 'Evergreen - Manajemen Uang Saku',      'evergreen',  -70,  -72, 2),
  ('kirana@example.com', 1, 'Evergreen - Tips Anti Begadang',       'evergreen',  -45,  -47, 1),
  ('kirana@example.com', 1, 'Konten Promo Beasiswa',                'specific',   -20,  -18, 2),

  ('adit@example.com',   1, 'Evergreen - Cerita Wirausaha',         'evergreen', -360, -362, 1),
  ('adit@example.com',   1, 'Evergreen - Modal Pertama',            'evergreen', -330, -331, 1),
  ('adit@example.com',   2, 'Evergreen - Kelas Bisnis Batch 1',     'evergreen', -170, -172, 1),
  ('adit@example.com',   2, 'Evergreen - Kelas Bisnis Batch 2',     'evergreen', -140, -141, 2),
  ('adit@example.com',   2, 'Evergreen - Studi Kasus UMKM',         'evergreen', -110, -112, 1),
  ('adit@example.com',   2, 'Konten Penutup Program',               'specific',   -80, null, 1),

  ('melati@example.com', 1, 'Evergreen - Resep Sarapan Cepat',      'evergreen', -160, -162, 1),
  ('melati@example.com', 1, 'Evergreen - Meal Prep Anak Kos',       'evergreen', -130, -131, 1),
  ('melati@example.com', 1, 'Evergreen - Dapur Minimalis',          'evergreen', -100, -105, 2),
  ('melati@example.com', 1, 'Evergreen - Belanja Mingguan',         'evergreen',  -70,  -72, 1),
  ('melati@example.com', 1, 'Konten Kolaborasi Brand',              'specific',   -40,  -42, 1),
  ('melati@example.com', 1, 'Evergreen - Camilan Sehat',            'evergreen',  -15,  -20, 2);

insert into contents (
  contract_id, name, type, brief, deadline, status,
  video_link, video_submitted_at, platform, views, likes, engagement
)
select periods.contract_id,
       p.name,
       p.type::content_type,
       case when p.type = 'specific' then 'Brief lengkap dikirim admin lewat email.' else '' end,
       current_date + p.deadline_offset,
       (case when p.submitted_offset is null then 'scheduled' else 'link_submitted' end)::content_status,
       case when p.submitted_offset is null then null
            else 'https://instagram.com/reel/' || left(md5(p.email || p.name), 12) end,
       case when p.submitted_offset is null then null else current_date + p.submitted_offset end,
       (case when p.submitted_offset is null then null else 'instagram' end)::social_platform,
       case when p.submitted_offset is null then null else 4000 + (abs(hashtext(p.name)) % 40000) end,
       case when p.submitted_offset is null then null else 200 + (abs(hashtext(p.name)) % 3000) end,
       case when p.submitted_offset is null then null
            else round((2 + (abs(hashtext(p.name)) % 700) / 100.0)::numeric, 2) end
from seed_content_plan p
join users u on u.email = p.email
join creators c on c.user_id = u.id
join (
  select ct.id as contract_id,
         ct.creator_id,
         row_number() over (partition by ct.creator_id order by ct.start_date) as period
  from contracts ct
) periods on periods.creator_id = c.id and periods.period = p.period;

-- One row per draft version. The first is the original hand-in; any further row is a
-- revision, which is what the average-revision figure counts.
insert into submissions (content_id, creator_id, link, revision_notes, created_at)
select ct.id,
       c.id,
       'https://drive.google.com/file/' || left(md5(p.name || n::text), 14),
       case when n = 1 then null
            else 'Revisi ke-' || (n - 1) || ': audio dan pencahayaan diperbaiki.' end,
       (current_date + p.deadline_offset - (p.submission_count - n) * 3)::timestamptz
from seed_content_plan p
join users u on u.email = p.email
join creators c on c.user_id = u.id
join contracts ctr on ctr.creator_id = c.id
join contents ct on ct.contract_id = ctr.id and ct.name = p.name
cross join lateral generate_series(1, p.submission_count) as n
where p.submission_count > 0;

commit;
