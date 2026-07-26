"""Send transactional email via Resend (free tier)."""

from __future__ import annotations

import httpx

from app.config import settings


class EmailError(Exception):
    pass


def send_email(*, to: str, subject: str, html: str, text: str | None = None) -> None:
    api_key = settings.resend_api_key.strip()
    from_addr = settings.resend_from.strip()
    if not api_key or not from_addr:
        raise EmailError("Email sending is not configured")

    payload: dict = {
        "from": from_addr,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if res.status_code >= 400:
        detail = res.text[:300]
        raise EmailError(f"Email send failed ({res.status_code}): {detail}")


def send_sargam_sign_in_code(*, to: str, code: str) -> None:
    subject = f"Your {settings.product_name} sign-in code"
    html = f"""
<div style="font-family:Georgia,serif;line-height:1.5;color:#222;max-width:520px">
  <h2 style="margin:0 0 12px">{settings.product_name} sign-in</h2>
  <p style="margin:0 0 12px">Enter this code on the Sargam page:</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">{code}</p>
  <p style="margin:0;color:#666;font-size:14px">This code expires shortly. If you did not request it, you can ignore this email.</p>
</div>
""".strip()
    text = f"Your {settings.product_name} sign-in code is {code}"
    send_email(to=to, subject=subject, html=html, text=text)
