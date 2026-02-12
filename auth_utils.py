"""JWT verification for Clerk authentication.

Verifies session tokens using Clerk's JWKS (JSON Web Key Set) endpoint.
Uses PyJWT with RS256 for signature verification. No Clerk SDK needed.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from http.server import BaseHTTPRequestHandler
from typing import Any

import jwt

logger = logging.getLogger("ttf2stitch.auth")

# JWKS cache: refreshed every hour
_jwks_cache: dict[str, Any] | None = None
_jwks_cache_time: float = 0
_JWKS_TTL = 3600


def _get_frontend_api() -> str:
    fapi = os.environ.get("CLERK_FRONTEND_API", "")
    if not fapi:
        raise RuntimeError("CLERK_FRONTEND_API environment variable not set")
    return fapi


def _fetch_jwks() -> dict[str, Any]:
    """Fetch and cache JWKS from Clerk's well-known endpoint."""
    global _jwks_cache, _jwks_cache_time

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache

    url = f"https://{_get_frontend_api()}/.well-known/jwks.json"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310
        data = json.loads(resp.read())

    _jwks_cache = data
    _jwks_cache_time = now
    return data


def verify_token(token: str) -> dict[str, Any] | None:
    """Verify a Clerk session JWT and return claims, or None if invalid."""
    try:
        jwks_data = _fetch_jwks()
        jwk_set = jwt.PyJWKSet.from_dict(jwks_data)

        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        signing_key = None
        for key in jwk_set.keys:
            if key.key_id == kid:
                signing_key = key
                break

        if not signing_key:
            logger.warning("No matching JWK for kid=%s", kid)
            return None

        fapi = _get_frontend_api()
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=f"https://{fapi}",
            options={"verify_aud": False},
        )
        return claims
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug("Invalid token: %s", e)
        return None
    except Exception:
        logger.exception("JWT verification failed")
        return None


def get_bearer_token(handler: BaseHTTPRequestHandler) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def is_auth_enabled() -> bool:
    """Check if Clerk auth is configured (CLERK_FRONTEND_API is set)."""
    return bool(os.environ.get("CLERK_FRONTEND_API"))
