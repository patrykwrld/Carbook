create table public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.plates (
  plate text primary key check (plate ~ '^[A-Z0-9]{2,10}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  comment_count integer not null default 0
);

create table public.comments (
  id bigint generated always as identity primary key,
  plate text not null references public.plates (plate) check (plate ~ '^[A-Z0-9]{2,10}$'),
  user_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (char_length(body) between 3 and 1000),
  tag text check (tag is null or tag in ('SAFE_DRIVING', 'AGGRESSIVE_DRIVING', 'LET_MERGE', 'PHONE_USE', 'OTHER')),
  image_path text,
  flag_count integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.flags (
  comment_id bigint not null references public.comments (id),
  user_id uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.plates enable row level security;
alter table public.comments enable row level security;
alter table public.flags enable row level security;
