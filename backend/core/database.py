"""Supabase client factory (service role for server-side operations).

Uses HTTP/1.1 (not HTTP/2) to avoid connection-pool exhaustion on
serverless / free-tier hosts — the supabase-py
library defaults to HTTP/2 which can overflow the connection pool when
many quick queries are issued in parallel.
"""
from functools import lru_cache

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from .config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
        options=ClientOptions(http_client=httpx.Client(http2=False)),
    )
