def _build_sync_engine():
    return create_engine(sync_url, connect_args=connect_args, pool_pre_ping=True)
