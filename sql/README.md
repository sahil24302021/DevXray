# DevXray Database Setup & SQL Migrations

This folder contains all database setup scripts and migrations for the DevXray Supabase database.

## 🚀 Quick Setup (All-in-One)

You only need to run **`master_setup.sql`** once in your Supabase SQL Editor.

1. Open [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project **Dev-Xray**.
3. In the left navigation, click on **SQL Editor** (`>_`).
4. Click **New query**.
5. Copy and paste the entire contents of [`sql/master_setup.sql`](./master_setup.sql).
6. Click **Run** (or `Cmd + Enter` / `Ctrl + Enter`).

---

## 📦 What `master_setup.sql` Creates

| Table / Feature | Description |
| :--- | :--- |
| `public.profiles` | User accounts, current plan, scan limits & usage counts, subscription details. |
| `public.candidates` | Scanned candidate reports, scores, tiers, radar chart dimensions, and full JSON reports. |
| `public.payments` | Razorpay order IDs, payment IDs, signatures, timestamps, and payment statuses. |
| `public.github_scans` | Backend cache for GitHub scans to prevent redundant GitHub API calls. |
| `public.shared_reports` | Public shareable link tokens and view tracking for reports. |
| `public.settings` | Backend system settings and session cookies (e.g., scraper session storage). |
| `handle_new_user()` trigger | Automatically provisions a `profiles` row whenever a user signs up via **Google OAuth** or **Email**. |
| **Row Level Security (RLS)** | Scopes all user data to `auth.uid()` while allowing `service_role` (backend/payment verify) full access. |

---

## 🗄️ Migration History (`migrations/`)

The `migrations/` folder contains historical incremental scripts for reference:
- `001_full_sync.sql`: Initial production synchronization.
- `002_github_scans_rls.sql`: RLS policies for `github_scans`.
- `003_security_hardening.sql`: Security hardening for candidates, profiles, and shared reports.
- `004_frontend_profiles_payments.sql`: Profiles and Razorpay payments schema.
- `005_candidates_migration.sql`: Column updates for candidate report storage.
- `006_candidates_schema.sql`: Candidates base schema.

> **Note:** All migrations above have been consolidated and deduplicated into `master_setup.sql`.
