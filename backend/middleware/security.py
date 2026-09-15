"""
middleware/security.py — Headers de sécurité HTTP.

Chaque header est commenté avec sa raison d'être.
Ces headers sont la première ligne de défense côté réseau.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Empêche le navigateur de deviner le Content-Type (MIME sniffing attacks).
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Interdit l'affichage dans une iframe → protection clickjacking.
        response.headers["X-Frame-Options"] = "DENY"

        # Politique de référent : n'envoie que l'origine, pas le chemin complet.
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Content Security Policy : en production, affiner selon les besoins.
        # default-src 'self' : toutes les ressources viennent du même domaine.
        # script-src 'self' : pas de scripts inline, pas de CDN externe.
        # object-src 'none' : interdit Flash/plugins.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob:; "
            "object-src 'none'; "
            "frame-ancestors 'none';"
        )

        # Force HTTPS pour 1 an (uniquement si le site est en HTTPS).
        # Désactivé ici pour ne pas bloquer le développement local.
        # En production, décommenter :
        # response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Permissions Policy : désactive les APIs sensibles non utilisées.
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        return response
