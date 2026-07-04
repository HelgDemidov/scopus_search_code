from abc import ABC, abstractmethod


class IEmailService(ABC):
    @abstractmethod
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None: ...

    @abstractmethod
    async def send_alert_email(self, to_email: str, subject: str, message: str) -> None: ...
