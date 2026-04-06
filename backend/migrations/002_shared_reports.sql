create table if not exists shared_reports (
    token text primary key,
    candidate_name text,
    report_data text not null,
    expires_at timestamptz not null,
    created_at timestamptz default now(),
    view_count integer default 0
);
