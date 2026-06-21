-- ApartPro - Schema Supabase
-- Rulează în Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- PROPRIETARI
-- =====================
create table if not exists proprietari (
  id uuid primary key default uuid_generate_v4(),
  nume text not null,
  email text,
  telefon text,
  iban text,
  banca text,
  adresa text,
  cnp_cui text,
  nota text,
  activ boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- APARTAMENTE
-- =====================
create table if not exists apartamente (
  id uuid primary key default uuid_generate_v4(),
  nume text not null,
  adresa text not null,
  zona text,
  nr_camere integer default 1,
  capacitate_max integer default 2,
  pret_standard numeric(10,2) default 0,
  proprietar_id uuid references proprietari(id) on delete set null,
  -- Setari comision
  comision_tip text default 'procent_net_dupa_costuri',
  -- procent_brut | procent_net_platforme | procent_net_dupa_costuri | fix_lunar | mixt
  comision_procent numeric(5,2) default 20,
  comision_fix numeric(10,2) default 0,
  -- Costuri suportate de administrator (nu se scad din proprietar)
  costuri_admin text[] default array[]::text[],
  -- airbnb_link, booking_link etc.
  link_airbnb text,
  link_booking text,
  link_site text,
  instructiuni_checkin text,
  reguli text,
  dotari text[],
  status text default 'activ', -- activ | inactiv | mentenanta
  nota text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- REZERVARI
-- =====================
create table if not exists rezervari (
  id uuid primary key default uuid_generate_v4(),
  apartament_id uuid references apartamente(id) on delete cascade,
  proprietar_id uuid references proprietari(id) on delete set null,
  canal text not null default 'direct',
  -- booking | airbnb | direct | telefon | whatsapp | site
  nume_client text not null,
  email_client text,
  telefon_client text,
  data_checkin date not null,
  data_checkout date not null,
  nr_nopti integer generated always as (data_checkout - data_checkin) stored,
  nr_persoane integer default 1,
  valoare_bruta numeric(10,2) default 0,
  taxa_curatenie_incasata numeric(10,2) default 0,
  suma_incasata numeric(10,2) default 0,
  moneda text default 'RON',
  status_plata text default 'neplatit', -- neplatit | avans | achitat
  status_rezervare text default 'confirmata', -- cerere | confirmata | anulata | finalizata
  -- Comision platforma
  comision_platforma_procent numeric(5,2) default 0,
  comision_platforma_valoare numeric(10,2) default 0,
  tva_comision_platforma numeric(10,2) default 0,
  -- Costuri asociate rezervarii
  cost_curatenie numeric(10,2) default 0,
  cost_spalatorie numeric(10,2) default 0,
  cost_consumabile numeric(10,2) default 0,
  cost_mentenanta numeric(10,2) default 0,
  alte_costuri numeric(10,2) default 0,
  -- Calcul decont
  baza_calcul_comision numeric(10,2) default 0,
  comision_administrator numeric(10,2) default 0,
  suma_proprietar numeric(10,2) default 0,
  status_decont text default 'nedecontat', -- nedecontat | inclus | decontat
  observatii text,
  mesaj_checkin text,
  mesaj_checkout text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- CHELTUIELI
-- =====================
create table if not exists cheltuieli (
  id uuid primary key default uuid_generate_v4(),
  apartament_id uuid references apartamente(id) on delete cascade,
  proprietar_id uuid references proprietari(id) on delete set null,
  rezervare_id uuid references rezervari(id) on delete set null,
  data date not null default current_date,
  categorie text not null,
  -- curatenie | spalatorie | consumabile | mentenanta | reparatii | comision_booking
  -- comision_airbnb | tva_platforma | contabilitate | fotografii | alte
  descriere text not null,
  valoare numeric(10,2) not null default 0,
  tva numeric(10,2) default 0,
  suportat_de text default 'proprietar', -- administrator | proprietar | impartit
  procent_impartit numeric(5,2) default 50,
  atasament_url text,
  status text default 'validat', -- nevalidat | validat | inclus_decont
  nota text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- DECONTURI
-- =====================
create table if not exists deconturi (
  id uuid primary key default uuid_generate_v4(),
  apartament_id uuid references apartamente(id) on delete cascade,
  proprietar_id uuid references proprietari(id) on delete set null,
  luna integer not null, -- 1-12
  an integer not null,
  perioada_start date not null,
  perioada_sfarsit date not null,
  -- Totale calculate
  total_incasari numeric(10,2) default 0,
  total_comisioane_platforme numeric(10,2) default 0,
  total_tva_platforme numeric(10,2) default 0,
  total_costuri_operationale numeric(10,2) default 0,
  baza_comision_administrator numeric(10,2) default 0,
  comision_administrator_procent numeric(5,2) default 20,
  comision_administrator_valoare numeric(10,2) default 0,
  suma_neta_proprietar numeric(10,2) default 0,
  -- Meta
  nr_nopti_ocupate integer default 0,
  nr_rezervari integer default 0,
  grad_ocupare numeric(5,2) default 0,
  status text default 'draft', -- draft | aprobat | platit
  data_platii date,
  nota text,
  rezervari_ids uuid[],
  cheltuieli_ids uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(apartament_id, luna, an)
);

-- =====================
-- REGULI DE CALCUL (templates)
-- =====================
create table if not exists reguli_calcul (
  id uuid primary key default uuid_generate_v4(),
  nume text not null,
  descriere text,
  comision_tip text default 'procent_net_dupa_costuri',
  comision_procent numeric(5,2) default 20,
  comision_fix numeric(10,2) default 0,
  scade_comision_platforma boolean default true,
  scade_tva_platforma boolean default true,
  costuri_suportate_admin text[] default array[]::text[],
  costuri_suportate_proprietar text[] default array[]::text[],
  activa boolean default true,
  created_at timestamptz default now()
);

-- =====================
-- TASKURI OPERATIONALE
-- =====================
create table if not exists taskuri (
  id uuid primary key default uuid_generate_v4(),
  apartament_id uuid references apartamente(id) on delete cascade,
  rezervare_id uuid references rezervari(id) on delete set null,
  tip text not null, -- curatenie | schimb_lenjerii | mentenanta | checkin | checkout | aprovizionare
  titlu text not null,
  descriere text,
  data_limita date,
  ora_limita time,
  responsabil text,
  status text default 'de_facut', -- de_facut | in_lucru | finalizat | template
  prioritate text default 'normala', -- scazuta | normala | urgenta
  nota text,
  business text,
  persoana text,
  impact_score int,
  effort_score int,
  priority_score int,
  recurent boolean default false,
  interval_zile int,
  data_urmatoare date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- TRIGGERS updated_at
-- =====================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger proprietari_updated_at before update on proprietari
  for each row execute function update_updated_at();
create trigger apartamente_updated_at before update on apartamente
  for each row execute function update_updated_at();
create trigger rezervari_updated_at before update on rezervari
  for each row execute function update_updated_at();
create trigger cheltuieli_updated_at before update on cheltuieli
  for each row execute function update_updated_at();
create trigger deconturi_updated_at before update on deconturi
  for each row execute function update_updated_at();
create trigger taskuri_updated_at before update on taskuri
  for each row execute function update_updated_at();

-- =====================
-- ROW LEVEL SECURITY
-- =====================
alter table proprietari enable row level security;
alter table apartamente enable row level security;
alter table rezervari enable row level security;
alter table cheltuieli enable row level security;
alter table deconturi enable row level security;
alter table reguli_calcul enable row level security;
alter table taskuri enable row level security;

-- Politici permisive (ajustează pentru auth multi-user ulterior)
create policy "Allow all proprietari" on proprietari for all using (true);
create policy "Allow all apartamente" on apartamente for all using (true);
create policy "Allow all rezervari" on rezervari for all using (true);
create policy "Allow all cheltuieli" on cheltuieli for all using (true);
create policy "Allow all deconturi" on deconturi for all using (true);
create policy "Allow all reguli" on reguli_calcul for all using (true);
create policy "Allow all taskuri" on taskuri for all using (true);

-- =====================
-- DATE DEMO
-- =====================
insert into reguli_calcul (nume, descriere, comision_tip, comision_procent, scade_comision_platforma, scade_tva_platforma)
values
  ('Standard 20% net după costuri', 'Comision 20% din suma rămasă după toate costurile', 'procent_net_dupa_costuri', 20, true, true),
  ('20% din brut', 'Comision 20% calculat din valoarea brută a rezervării', 'procent_brut', 20, false, false),
  ('20% net după platforme', 'Comision 20% după scăderea comisioanelor platformelor', 'procent_net_platforme', 20, true, false),
  ('Comision fix 500 RON/lună', 'Comision lunar fix, indiferent de ocupare', 'fix_lunar', 0, false, false)
on conflict do nothing;

insert into proprietari (nume, email, telefon, iban, banca)
values
  ('Ion Popa', 'ion.popa@email.ro', '0721234567', 'RO49AAAA1B31007593840000', 'BCR'),
  ('Ana Mihai', 'ana.mihai@email.ro', '0744567890', 'RO49BBBB1B31007593840001', 'BRD')
on conflict do nothing;
