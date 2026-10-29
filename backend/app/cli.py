"""Admin account management from the server's command line (admins cannot sign up through the API).

    python -m app.cli create-admin --email you@example.com --name "Your Name"
    python -m app.cli reset-admin --email you@example.com [--password] [--2fa]
    python -m app.cli deactivate-admin --email you@example.com
    python -m app.cli list-admins

Passwords are typed at a hidden prompt (or read from stdin with ``--password-stdin``). After
``create-admin`` or ``reset-admin --2fa``, the next sign-in at /admin shows a QR code to set up the
authenticator app.
"""

from __future__ import annotations

import argparse
import getpass
import sys
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models import AdminUser

MIN_ADMIN_PASSWORD_LENGTH = 12


class CliError(Exception):
    """A user-facing command-line error."""


def _out(message: str) -> None:
    sys.stdout.write(message + "\n")


def _read_password(from_stdin: bool) -> str:
    if from_stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("New admin password: ")
        if getpass.getpass("Repeat password: ") != password:
            raise CliError("Passwords do not match.")
    if len(password) < MIN_ADMIN_PASSWORD_LENGTH:
        raise CliError(f"Use at least {MIN_ADMIN_PASSWORD_LENGTH} characters.")
    if password.isdigit() or password.isalpha():
        raise CliError("Use a mix of letters and numbers or symbols.")
    return password


def _get_admin(db: Session, email: str) -> AdminUser:
    admin = db.scalars(select(AdminUser).where(AdminUser.email == email.strip().lower())).first()
    if admin is None:
        raise CliError(f"No admin with email {email}.")
    return admin


def create_admin(db: Session, email: str, name: str, password: str) -> AdminUser:
    """Create an admin; 2FA is set up at their first sign-in."""
    email = email.strip().lower()
    if "@" not in email:
        raise CliError("Enter a valid email address.")
    if db.scalars(select(AdminUser).where(AdminUser.email == email)).first() is not None:
        raise CliError(f"An admin with email {email} already exists.")
    admin = AdminUser(email=email, full_name=name.strip() or email, password_hash=hash_password(password))
    db.add(admin)
    db.commit()
    return admin


def reset_admin(db: Session, email: str, *, password: str | None, reset_2fa: bool) -> AdminUser:
    """Change the password and/or clear 2FA; always signs the admin out everywhere."""
    admin = _get_admin(db, email)
    if password is not None:
        admin.password_hash = hash_password(password)
    if reset_2fa:
        admin.totp_secret = None
        admin.totp_pending_secret = None
        admin.totp_last_step = None
    admin.is_active = True
    admin.session_version += 1
    db.commit()
    return admin


def deactivate_admin(db: Session, email: str) -> AdminUser:
    """Block an admin from signing in and end their sessions."""
    admin = _get_admin(db, email)
    admin.is_active = False
    admin.session_version += 1
    db.commit()
    return admin


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point for ``python -m app.cli``."""
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Manage SlotEase admin accounts.")
    commands = parser.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create-admin", help="Create an admin account.")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--password-stdin", action="store_true", help="Read the password from stdin.")

    reset = commands.add_parser("reset-admin", help="Reset an admin's password and/or 2FA.")
    reset.add_argument("--email", required=True)
    reset.add_argument("--password", action="store_true", help="Set a new password.")
    reset.add_argument(
        "--2fa", dest="reset_2fa", action="store_true", help="Clear 2FA; set it up again at next sign-in."
    )
    reset.add_argument("--password-stdin", action="store_true", help="Read the new password from stdin.")

    deactivate = commands.add_parser("deactivate-admin", help="Block an admin from signing in.")
    deactivate.add_argument("--email", required=True)

    commands.add_parser("list-admins", help="List admin accounts.")

    args = parser.parse_args(argv)
    db = SessionLocal()
    try:
        if args.command == "create-admin":
            admin = create_admin(db, args.email, args.name, _read_password(args.password_stdin))
            _out(f"Created admin {admin.email}. Sign in at /admin/login to set up two-step sign-in.")
        elif args.command == "reset-admin":
            if not args.password and not args.reset_2fa:
                raise CliError("Choose --password, --2fa or both.")
            new_password = _read_password(args.password_stdin) if args.password else None
            admin = reset_admin(db, args.email, password=new_password, reset_2fa=args.reset_2fa)
            _out(f"Updated {admin.email}; all of their sessions were signed out.")
        elif args.command == "deactivate-admin":
            admin = deactivate_admin(db, args.email)
            _out(f"Deactivated {admin.email}.")
        else:
            admins = db.scalars(select(AdminUser).order_by(AdminUser.id)).all()
            if not admins:
                _out("No admin accounts yet.")
            for admin in admins:
                state = "active" if admin.is_active else "deactivated"
                twofa = "2FA on" if admin.totp_secret else "2FA not set up"
                _out(f"{admin.id}\t{admin.email}\t{admin.full_name}\t{state}\t{twofa}")
    except CliError as exc:
        sys.stderr.write(f"Error: {exc}\n")
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
