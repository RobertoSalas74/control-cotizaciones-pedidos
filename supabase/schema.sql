-- Control de Cotizaciones y Pedidos v1.0
-- Solo crea tablas NUEVAS con prefijo cp_. No modifica ni borra nada existente.

create table if not exists public.cp_registros (
  id                bigint generated always as identity primary key,
  tipo              text not null check (tipo in ('compra','tarea')),
  nombre            text not null,              -- asunto del correo de solicitud
  solicitante       text,
  estado            text not null,
  estado_desde      timestamptz not null default now(),
  fecha_limite      date,                       -- fecha requerida / límite
  responsable       text,
  notas             text,
  proveedor         text,                       -- se llena con la OC
  monto             numeric(14,2),              -- se llena con la OC
  moneda            text default 'PEN',
  oc_numero         text,
  fecha_entrega_est date,
  created_at        timestamptz not null default now()
);

create table if not exists public.cp_documentos (
  id             bigint generated always as identity primary key,
  registro_id    bigint not null references public.cp_registros(id) on delete cascade,
  tipo_doc       text not null check (tipo_doc in ('cotizacion','oc','guia','factura')),
  proveedor      text,
  ruc            text,
  numero         text,
  fecha          date,
  validez_hasta  date,
  fecha_entrega  date,
  moneda         text default 'PEN',
  total          numeric(14,2),
  items          jsonb not null default '[]'::jsonb,
  archivo_path   text,
  archivo_nombre text,
  created_at     timestamptz not null default now()
);

create table if not exists public.cp_gestiones (
  id              bigint generated always as identity primary key,
  registro_id     bigint not null references public.cp_registros(id) on delete cascade,
  accion          text not null,
  detalle         text,
  proxima_accion  text,
  proxima_fecha   date,
  archivo_path    text,
  archivo_nombre  text,
  auto            boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists cp_documentos_registro_idx on public.cp_documentos(registro_id);
create index if not exists cp_gestiones_registro_idx  on public.cp_gestiones(registro_id);

alter table public.cp_registros  enable row level security;
alter table public.cp_documentos enable row level security;
alter table public.cp_gestiones  enable row level security;

create policy cp_registros_anon  on public.cp_registros  for all to anon using (true) with check (true);
create policy cp_documentos_anon on public.cp_documentos for all to anon using (true) with check (true);
create policy cp_gestiones_anon  on public.cp_gestiones  for all to anon using (true) with check (true);

-- Bucket privado para PDFs y fotos
insert into storage.buckets (id, name, public)
values ('cp-adjuntos', 'cp-adjuntos', false)
on conflict (id) do nothing;

create policy cp_adjuntos_anon on storage.objects for all to anon
  using (bucket_id = 'cp-adjuntos') with check (bucket_id = 'cp-adjuntos');
