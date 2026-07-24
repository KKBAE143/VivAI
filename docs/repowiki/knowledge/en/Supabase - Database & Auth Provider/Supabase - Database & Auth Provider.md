---
kind: external_dependency
name: Supabase - Database & Auth Provider
slug: supabase
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
source_files:
    - backend/core/database.py
    - backend/supabase_schema.sql
    - backend/core/config.py
---

Primary database, authentication, and storage provider. Backend uses Supabase Python SDK with service-role key for server operations and anon key for client access. Schema defined in supabase_schema.sql with tables for profiles, projects, teams, viva_sessions, and advanced features. Storage bucket 'uploads' used for encrypted file storage. Data localization to India (AWS Mumbai/Azure) required for DPDP compliance.