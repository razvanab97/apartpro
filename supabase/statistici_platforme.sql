-- Statistici platforme (Airbnb + Booking) — evoluție zilnică
-- Rulează în Supabase SQL Editor (Dashboard → SQL Editor)

drop table if exists statistici_platforme;

create table statistici_platforme (
  id uuid primary key default uuid_generate_v4(),
  apartament_id uuid references apartamente(id) on delete cascade,
  platforma text not null check (platforma in ('airbnb','booking')),
  data_inregistrare date not null default current_date,

  -- AIRBNB: Ocupare
  rata_ocupare           numeric(6,2),
  nopti_rezervate        integer,
  nopti_blocate          integer,
  nopti_fara_rezervare   integer,
  checkin_uri            integer,
  rata_anulari           numeric(6,2),
  durata_medie_sedere    numeric(6,2),

  -- AIRBNB: Tarif
  tarif_mediu_noapte     numeric(10,2),
  tarif_vs_similar       numeric(10,2),   -- delta RON față de anunțuri similare

  -- AIRBNB: Vizibilitate
  afisari_pagina_total   integer,
  afisari_p1_total       integer,          -- total afișări prima pagină căutare
  rata_afisari_p1        numeric(6,2),     -- % afișări pe prima pagină

  -- AIRBNB: Conversie
  rata_conversie_globala    numeric(8,4),
  rata_conversie_cautari_p1 numeric(6,2), -- % căutări → prima pagină
  rata_conversie_vizite_rez numeric(6,2), -- % vizite → rezervare

  -- AIRBNB: Altele (comparații vs. similare)
  wishlist_total            integer,
  wishlist_vs_similar       integer,
  rata_ocupare_vs_similar   numeric(6,2),
  durata_sedere_vs_similar  numeric(6,2),

  -- BOOKING: Vizibilitate & Clasament
  vizualizari_cautari    integer,
  vizualizari_pagina     integer,
  rezervari_confirmate   integer,
  scor_pozitie_rank      integer,         -- ex. 559 (rangul în clasament)
  scor_pozitie_total     integer,         -- ex. 686 (total proprietăți)
  scor_pozitie_pct       numeric(6,2),    -- ex. 18.0 (mai bine decât X%)

  -- BOOKING: Conversie & Calitate
  rata_conversie_cautari numeric(8,4),
  rata_conversie_pagina  numeric(6,2),
  adr                    numeric(10,2),
  scor_comentarii        numeric(5,2),
  completare_pagina_pct  numeric(6,2),

  -- Meta
  raw_extras  jsonb,
  created_at  timestamptz default now()
);

alter table statistici_platforme enable row level security;
create policy "Allow all statistici_platforme" on statistici_platforme for all using (true);

create index statistici_apt_plat_data on statistici_platforme (apartament_id, platforma, data_inregistrare desc);
