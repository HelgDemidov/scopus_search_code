"""
ASGI-level debug middleware.

This wrapper sits below FastAPI in the ASGI stack — it intercepts every
call that Uvicorn makes to the application before FastAPI (or any of its
middleware) has a chance to run.  If requests appear here but not in the
FastAPI `log_requests` middleware, the problem is inside the FastAPI/
Starlette middleware chain.  If requests do NOT appear here, the problem
is at the network/Uvicorn level and never reaches Python at all.
"""

import traceback
from datetime import datetime, timezone


class ASGIDebugMiddleware:
    """Thin ASGI wrapper that logs every lifecycle event at the lowest level."""

    def __init__(self, app):
        self.app = app
        print("[asgi_debug] ASGIDebugMiddleware initialised and wrapping app", flush=True)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            # Pass lifespan events through transparently — we don't want to
            # interfere with FastAPI's startup/shutdown hooks.
            await self.app(scope, receive, send)
            return

        if scope["type"] == "http":
            method = scope.get("method", "?")
            path = scope.get("path", "?")
            query = scope.get("query_string", b"").decode("utf-8", errors="replace")
            full_path = f"{path}?{query}" if query else path
            ts = datetime.now(timezone.utc).isoformat()

            print(
                f"[asgi_debug] --> {ts} | {method} {full_path}",
                flush=True,
            )

            status_holder = {}

            async def send_wrapper(message):
                if message["type"] == "http.response.start":
                    status_holder["status"] = message.get("status", "?")
                    print(
                        f"[asgi_debug] <-- {method} {full_path} | status={status_holder['status']}",
                        flush=True,
                    )
                await send(message)

            try:
                await self.app(scope, receive, send_wrapper)
            except Exception as exc:
                print(
                    f"[asgi_debug] EXCEPTION during {method} {full_path}: "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )
                print(traceback.format_exc(), flush=True)
                raise

            return

        if scope["type"] == "websocket":
            path = scope.get("path", "?")
            print(f"[asgi_debug] WebSocket connection: {path}", flush=True)
            try:
                await self.app(scope, receive, send)
            except Exception as exc:
                print(
                    f"[asgi_debug] EXCEPTION on WebSocket {path}: "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )
                print(traceback.format_exc(), flush=True)
                raise
            return

        # Unknown scope type — pass through silently.
        await self.app(scope, receive, send)
