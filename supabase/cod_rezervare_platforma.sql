-- Codul rezervarii de la platforma (Airbnb HMXXXXXXXX / nr. rezervare Booking), completat manual
-- in formularul de rezervare. 5starDesk nu il trimite prin API (trimite doar ID-ul lui intern).
-- Necesar pe factura (Oblio, AB Textile - regim hotelier).
alter table rezervari add column if not exists cod_rezervare_platforma text;
create index if not exists rezervari_cod_rezervare_platforma_idx on rezervari(cod_rezervare_platforma);
