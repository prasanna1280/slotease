"""Plain, professional transactional e-mail templates (HTML + text).

Table-based layout with inline styles for e-mail client compatibility; no images, no gradients.
Every user-supplied value is escaped with :func:`html.escape` before it is placed in HTML.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from html import escape

BRAND_COLOR = "#1d4ed8"
TEXT_COLOR = "#0f172a"
MUTED_COLOR = "#475569"
BORDER_COLOR = "#e2e8f0"
FONT_STACK = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


@dataclass(frozen=True)
class RenderedEmail:
    """A rendered e-mail ready for :func:`app.services.notification_service.send_email`."""

    subject: str
    html: str
    text: str


@dataclass(frozen=True)
class BookingEmailContext:
    """Values shown in booking e-mails (raw, unescaped)."""

    business_name: str
    business_phone: str
    business_address: str | None
    service_name: str
    when: str
    reference: str
    price: str
    customer_name: str
    customer_phone: str
    customer_email: str | None
    notes: str | None
    manage_url: str | None = None


def format_price(amount: Decimal | str | int | float, currency: str = "INR") -> str:
    """Format a money amount for e-mails, e.g. ``Rs 450.00`` / ``USD 12.00``."""
    value = Decimal(str(amount)).quantize(Decimal("0.01"))
    label = "Rs" if currency.upper() == "INR" else currency.upper()
    return f"{label} {value:,.2f}"


def _rows(pairs: list[tuple[str, str]]) -> str:
    """Render label/value rows (both escaped)."""
    cells = []
    for label, value in pairs:
        cells.append(
            "<tr>"
            f'<td style="padding:8px 0;color:{MUTED_COLOR};font-size:14px;width:140px;vertical-align:top;">'
            f"{escape(label)}</td>"
            f'<td style="padding:8px 0;color:{TEXT_COLOR};font-size:14px;font-weight:600;'
            'vertical-align:top;">'
            f"{escape(value)}</td>"
            "</tr>"
        )
    return "".join(cells)


def _layout(*, preheader: str, heading: str, intro_html: str, body_html: str, footer: str) -> str:
    """Wrap content in the shared e-mail shell. ``intro_html``/``body_html`` must already be escaped."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:{FONT_STACK};color:{TEXT_COLOR};">
<div style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
 style="max-width:560px;background:#ffffff;border:1px solid {BORDER_COLOR};border-radius:8px;">
<tr><td style="padding:20px 24px;border-bottom:1px solid {BORDER_COLOR};">
<span style="font-size:16px;font-weight:700;color:{BRAND_COLOR};">SlotEase</span>
</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;color:{TEXT_COLOR};">{escape(heading)}</h1>
{intro_html}
{body_html}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid {BORDER_COLOR};color:{MUTED_COLOR};font-size:12px;">
{escape(footer)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _paragraph(text: str) -> str:
    return (
        f'<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:{MUTED_COLOR};">{escape(text)}</p>'
    )


def _details_table(pairs: list[tuple[str, str]]) -> str:
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="border-top:1px solid {BORDER_COLOR};border-bottom:1px solid {BORDER_COLOR};'
        'margin:0 0 16px;">'
        f"{_rows(pairs)}</table>"
    )


def _button(url: str, label: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr>'
        f'<td style="background:{BRAND_COLOR};border-radius:6px;">'
        f'<a href="{escape(url, quote=True)}" style="display:inline-block;padding:10px 18px;color:#ffffff;'
        f'font-size:14px;font-weight:600;text-decoration:none;">{escape(label)}</a>'
        "</td></tr></table>"
    )


def booking_confirmation_customer(ctx: BookingEmailContext) -> RenderedEmail:
    """E-mail to the customer confirming their booking."""
    subject = f"Booking confirmed: {ctx.service_name} at {ctx.business_name}"
    pairs = [
        ("Business", ctx.business_name),
        ("Service", ctx.service_name),
        ("Date & time", ctx.when),
        ("Booking ID", ctx.reference),
        ("Price", ctx.price),
        ("Phone", ctx.business_phone),
    ]
    if ctx.business_address:
        pairs.append(("Address", ctx.business_address))
    intro = _paragraph(f"Hi {ctx.customer_name}, your appointment at {ctx.business_name} is confirmed.")
    outro = _paragraph(
        f"Need to change or cancel? Please call {ctx.business_name} on {ctx.business_phone} "
        f"and quote booking ID {ctx.reference}."
    )
    html_body = _layout(
        preheader=f"{ctx.service_name} on {ctx.when}",
        heading="Your booking is confirmed",
        intro_html=intro,
        body_html=_details_table(pairs) + outro,
        footer=f"Sent by SlotEase on behalf of {ctx.business_name}.",
    )
    text_lines = [
        f"Hi {ctx.customer_name},",
        "",
        f"Your appointment at {ctx.business_name} is confirmed.",
        "",
        *[f"{label}: {value}" for label, value in pairs],
        "",
        f"Need to change or cancel? Call {ctx.business_phone} and quote booking ID {ctx.reference}.",
        "",
        f"Sent by SlotEase on behalf of {ctx.business_name}.",
    ]
    return RenderedEmail(subject=subject, html=html_body, text="\n".join(text_lines))


def booking_notification_owner(ctx: BookingEmailContext) -> RenderedEmail:
    """E-mail to the business owner announcing a new booking."""
    subject = f"New booking: {ctx.customer_name}, {ctx.when}"
    pairs = [
        ("Customer", ctx.customer_name),
        ("Phone", ctx.customer_phone),
    ]
    if ctx.customer_email:
        pairs.append(("Email", ctx.customer_email))
    pairs += [
        ("Service", ctx.service_name),
        ("Date & time", ctx.when),
        ("Booking ID", ctx.reference),
        ("Price", ctx.price),
    ]
    if ctx.notes:
        pairs.append(("Notes", ctx.notes))
    body = _details_table(pairs)
    if ctx.manage_url:
        body += _button(ctx.manage_url, "Open dashboard")
    html_body = _layout(
        preheader=f"{ctx.customer_name} booked {ctx.service_name}",
        heading="New booking",
        intro_html=_paragraph(f"A new appointment was booked at {ctx.business_name}."),
        body_html=body,
        footer="You receive this because you own this business on SlotEase.",
    )
    text_lines = [
        f"New booking at {ctx.business_name}",
        "",
        *[f"{label}: {value}" for label, value in pairs],
    ]
    if ctx.manage_url:
        text_lines += ["", f"Open dashboard: {ctx.manage_url}"]
    return RenderedEmail(subject=subject, html=html_body, text="\n".join(text_lines))


def password_reset(reset_url: str, expires_minutes: int) -> RenderedEmail:
    """E-mail containing a password reset link."""
    subject = "Reset your SlotEase password"
    body = (
        _button(reset_url, "Reset password")
        + _paragraph(f"This link expires in {expires_minutes} minutes and can be used once.")
        + _paragraph("If the button does not work, copy this link into your browser:")
        + f'<p style="margin:0 0 16px;font-size:13px;word-break:break-all;color:{TEXT_COLOR};">'
        f"{escape(reset_url)}</p>"
        + _paragraph("If you did not ask to reset your password, you can ignore this e-mail.")
    )
    html_body = _layout(
        preheader="Use this link to choose a new password.",
        heading="Reset your password",
        intro_html=_paragraph("We received a request to reset the password for your SlotEase account."),
        body_html=body,
        footer="SlotEase - online bookings for clinics and salons.",
    )
    text = "\n".join(
        [
            "We received a request to reset the password for your SlotEase account.",
            "",
            f"Reset your password: {reset_url}",
            "",
            f"This link expires in {expires_minutes} minutes and can be used once.",
            "If you did not ask to reset your password, you can ignore this e-mail.",
        ]
    )
    return RenderedEmail(subject=subject, html=html_body, text=text)
