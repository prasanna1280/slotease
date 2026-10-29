"""Platform admin: admin users, audit log, payments ledger and business suspension.

Hand-written to match ``Base.metadata``'s naming convention.

Revision ID: 0002_admin
Revises: 0001_initial
Create Date: 2026-10-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_admin"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create admin_users, admin_audit_logs and payments; add businesses.is_suspended."""
    with op.batch_alter_table("businesses") as batch:
        batch.add_column(sa.Column("is_suspended", sa.Boolean(), nullable=False, server_default=sa.false()))

    # --- admin_users --------------------------------------------------------------------------
    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("totp_secret", sa.String(length=64), nullable=True),
        sa.Column("totp_pending_secret", sa.String(length=64), nullable=True),
        sa.Column("totp_last_step", sa.Integer(), nullable=True),
        sa.Column("session_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_admin_users"),
    )
    op.create_index("ix_admin_users_email", "admin_users", ["email"], unique=True)

    # --- admin_audit_logs ---------------------------------------------------------------------
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=True),
        sa.Column("admin_email", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=True),
        sa.Column("target_type", sa.String(length=30), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("summary", sa.String(length=255), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["admin_id"], ["admin_users.id"], name="fk_admin_audit_logs_admin_id_admin_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name="fk_admin_audit_logs_business_id_businesses",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_admin_audit_logs"),
    )
    op.create_index("ix_admin_audit_logs_admin_id", "admin_audit_logs", ["admin_id"])
    op.create_index("ix_admin_audit_logs_action", "admin_audit_logs", ["action"])
    op.create_index("ix_admin_audit_logs_business_id", "admin_audit_logs", ["business_id"])

    # --- payments -----------------------------------------------------------------------------
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=True),
        sa.Column("business_name", sa.String(length=120), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=64), nullable=True),
        sa.Column("provider_subscription_id", sa.String(length=64), nullable=True),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'INR'")),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("recorded_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("ck_payments_amount_positive")),
        sa.CheckConstraint("source IN ('razorpay', 'manual')", name=op.f("ck_payments_source_valid")),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], name="fk_payments_business_id_businesses", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_admin_id"],
            ["admin_users.id"],
            name="fk_payments_recorded_by_admin_id_admin_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_payments"),
        sa.UniqueConstraint("provider_payment_id", name="uq_payments_provider_payment_id"),
    )
    op.create_index("ix_payments_business_id", "payments", ["business_id"])
    op.create_index("ix_payments_paid_at", "payments", ["paid_at"])


def downgrade() -> None:
    """Drop everything created by :func:`upgrade`."""
    op.drop_index("ix_payments_paid_at", table_name="payments")
    op.drop_index("ix_payments_business_id", table_name="payments")
    op.drop_table("payments")

    op.drop_index("ix_admin_audit_logs_business_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_action", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_admin_id", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")

    op.drop_index("ix_admin_users_email", table_name="admin_users")
    op.drop_table("admin_users")

    with op.batch_alter_table("businesses") as batch:
        batch.drop_column("is_suspended")
