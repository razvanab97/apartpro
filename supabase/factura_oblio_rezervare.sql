-- Factura emisa in Oblio (AB Textile, seria RH - regim hotelier) pentru rezervare, din ContaFlow.
alter table rezervari add column if not exists factura_serie text;
alter table rezervari add column if not exists factura_numar text;
alter table rezervari add column if not exists factura_link text;
alter table rezervari add column if not exists factura_emisa_la timestamptz;
