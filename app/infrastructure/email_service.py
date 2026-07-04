import httpx

from app.config import settings
from app.interfaces.email_service import IEmailService


class BrevoEmailService(IEmailService):
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        html = (
            "<p>You requested a password reset for your Scopus Search account.</p>"
            f"<p><a href='{reset_url}'>Reset your password</a> (link valid for 1 hour).</p>"
            "<p>If you did not request this, you can safely ignore this email.</p>"
        )
        await self._send(to_email, "Scopus Search — password reset", html)

    async def send_alert_email(self, to_email: str, subject: str, message: str) -> None:
        await self._send(to_email, subject, f"<p>{message}</p>")

    async def _send(self, to_email: str, subject: str, html: str) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "Scopus Search", "email": settings.FROM_EMAIL},
                    "to": [{"email": to_email}],
                    "subject": subject,
                    "htmlContent": html,
                },
                timeout=10.0,
            )
            resp.raise_for_status()
