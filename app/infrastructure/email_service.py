from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import settings
from app.interfaces.email_service import IEmailService


class SMTPEmailService(IEmailService):
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Scopus Search — password reset"
        msg["From"] = settings.FROM_EMAIL
        msg["To"] = to_email

        html = (
            "<p>You requested a password reset for your Scopus Search account.</p>"
            f"<p><a href='{reset_url}'>Reset your password</a> (link valid for 1 hour).</p>"
            "<p>If you did not request this, you can safely ignore this email.</p>"
        )
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
