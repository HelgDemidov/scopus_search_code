RT_COOKIE_NAME: str = "refresh_token"
RT_COOKIE_MAX_AGE: int = 30 * 24 * 3600  # 30 дней

AT_HANDSHAKE_COOKIE_NAME: str = "auth_handshake"
AT_HANDSHAKE_MAX_AGE: int = 5 * 60  # 5 минут (только OAuth handshake)
