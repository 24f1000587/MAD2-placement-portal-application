"""
Outbound notifications for PlaceTrack.

Three channels are used:

1. In-app `Notification` rows (always written) so the bell icon in the UI
   works out of the box with zero configuration.
2. Google Chat incoming webhook (`GCHAT_WEBHOOK_URL`) for the daily deadline
   reminders, with a local-log fallback.
3. SMTP email (`MAIL_SERVER` + friends) for the monthly activity report,
   which the spec explicitly requires to be "created using HTML and sent
   via mail" to the admin - also with a local-log fallback so the report
   content is still demonstrable without a real mail account, per the
   "all demos should be possible on your local machine" requirement.
"""
import os
import smtplib
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests

from app.extensions import db
from app.models import Notification


def push_in_app(user_id: int, message: str, category: str = "info") -> None:
    note = Notification(user_id=user_id, message=message, category=category)
    db.session.add(note)
    db.session.commit()


def _log_to_file(text: str, log_path: str) -> None:
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as fh:
        fh.write(f"[{datetime.utcnow().isoformat()}Z] {text}\n")


def send_gchat_or_log(text: str, webhook_url: str, log_path: str) -> bool:
    """Send `text` to a Google Chat webhook if configured; otherwise log it.

    Returns True if it went out over the network, False if it fell back to
    the log file (both are considered a "successful" send for demo purposes).
    """
    if webhook_url:
        try:
            resp = requests.post(webhook_url, json={"text": text}, timeout=5)
            if resp.ok:
                return True
        except requests.RequestException:
            pass  # fall through to log fallback below

    _log_to_file(text, log_path)
    return False


def send_email_or_log(
    subject: str,
    html_body: str,
    to_email: str,
    log_path: str,
    mail_server: str = "",
    mail_port: int = 587,
    mail_use_tls: bool = True,
    mail_username: str = "",
    mail_password: str = "",
    mail_sender: str = "placetrack@institute.edu",
    attachment_path: str = None,
    attachment_name: str = None,
) -> bool:
    """Send the HTML report by real SMTP email if `MAIL_SERVER` is
    configured; otherwise write the full email (subject + HTML body) to the
    notification log so it's still fully demonstrable offline.

    Returns True if it actually went out over SMTP, False if it fell back
    to the log file.
    """
    smtp_error = None
    if mail_server:
        try:
            msg = MIMEMultipart("mixed")
            msg["Subject"] = subject
            msg["From"] = mail_sender
            msg["To"] = to_email

            body_wrapper = MIMEMultipart("alternative")
            body_wrapper.attach(MIMEText(html_body, "html"))
            msg.attach(body_wrapper)

            if attachment_path and os.path.exists(attachment_path):
                with open(attachment_path, "rb") as fh:
                    attachment = MIMEApplication(fh.read(), _subtype="pdf")
                attachment.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=attachment_name or os.path.basename(attachment_path),
                )
                msg.attach(attachment)

            with smtplib.SMTP(mail_server, mail_port, timeout=10) as server:
                if mail_use_tls:
                    server.starttls()
                if mail_username and mail_password:
                    server.login(mail_username, mail_password)
                server.sendmail(mail_sender, [to_email], msg.as_string())
            return True
        except (smtplib.SMTPException, OSError) as exc:
            # Don't swallow the reason - log it so a failed send is
            # diagnosable instead of silently looking identical to
            # "MAIL_SERVER not configured".
            smtp_error = f"{type(exc).__name__}: {exc}"

    attachment_note = f"\n(PDF attachment: {attachment_name or attachment_path})" if attachment_path else ""
    error_note = f"\n[SMTP send FAILED - fell back to this log. Reason: {smtp_error}]" if smtp_error else ""
    _log_to_file(
        f"[EMAIL -> {to_email}] Subject: {subject}\n{html_body}{attachment_note}{error_note}",
        log_path,
    )
    return False