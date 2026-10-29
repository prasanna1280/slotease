"""Platform administrators (SlotEase staff) and their audit log. Separate from tenant users."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TimestampMixin
from app.models.types import UTCDateTime


class AdminUser(TimestampMixin, Base):
    """A SlotEase operator who can see and manage every business. Created only from the CLI.

    Sign-in always needs the password plus a TOTP code (authenticator app). ``session_version`` is
    embedded in admin tokens; bumping it (password or 2FA reset) signs the admin out everywhere.
    """

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Secret offered during first sign-in; becomes ``totp_secret`` once a code from it is confirmed.
    totp_pending_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Last accepted TOTP time step, so a code cannot be replayed.
    totp_last_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    def __repr__(self) -> str:
        return f"<AdminUser id={self.id} email={self.email!r}>"


class AdminAuditLog(CreatedAtMixin, Base):
    """One admin action (who, what, on which record, before/after). Never edited from the API."""

    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    admin_email: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    # Kept after the business is deleted (SET NULL); ``summary`` still names it.
    business_id: Mapped[int | None] = mapped_column(
        ForeignKey("businesses.id", ondelete="SET NULL"), index=True, nullable=True
    )
    target_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    def __repr__(self) -> str:
        return f"<AdminAuditLog id={self.id} action={self.action!r}>"
