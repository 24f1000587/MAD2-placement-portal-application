"""
Background jobs for PlaceTrack, run via Celery + Redis.

  a) send_daily_deadline_reminders   -> Celery beat, every day
  b) generate_monthly_activity_report -> Celery beat, 1st of every month
  c) export_applications_csv          -> user-triggered async job (student
                                          dashboard "Export my applications")
"""
import csv
import os
from datetime import date, datetime, timedelta

from flask import current_app

from app.celery_app import celery
from app.extensions import db
from app.models import (
    Application,
    ApplicationStatus,
    PlacementDrive,
    DriveStatus,
    StudentProfile,
    CompanyProfile,
    MonthlyReport,
    User,
)
from app.utils.notify import push_in_app, send_gchat_or_log, send_email_or_log
from app.utils.pdf_generator import generate_monthly_report_pdf


# ---------------------------------------------------------------------------
# (a) Daily deadline reminders
# ---------------------------------------------------------------------------

@celery.task(name="app.tasks.send_daily_deadline_reminders")
def send_daily_deadline_reminders():
    """For every open drive whose deadline is within
    APPLICATION_DEADLINE_REMINDER_DAYS, remind every *eligible* student who
    has not yet applied."""
    window_days = current_app.config.get("APPLICATION_DEADLINE_REMINDER_DAYS", 2)
    today = date.today()
    target_dates = {today + timedelta(days=d) for d in range(0, window_days + 1)}

    drives = PlacementDrive.query.filter(
        PlacementDrive.status == DriveStatus.APPROVED,
        PlacementDrive.application_deadline.in_(target_dates),
    ).all()

    reminders_sent = 0
    webhook = current_app.config["GCHAT_WEBHOOK_URL"]
    log_path = current_app.config["NOTIFICATION_LOG_PATH"]

    for drive in drives:
        already_applied_ids = {
            app.student_id
            for app in Application.query.filter_by(drive_id=drive.id).all()
        }
        candidates = StudentProfile.query.filter(
            StudentProfile.branch.in_(drive.branch_list()),
            StudentProfile.cgpa >= drive.min_cgpa,
        ).all()

        for student in candidates:
            if student.id in already_applied_ids:
                continue
            if student.graduation_year not in drive.year_list():
                continue

            days_left = (drive.application_deadline - today).days
            message = (
                f"Reminder: '{drive.job_title}' at {drive.company.company_name} "
                f"closes in {days_left} day(s) (on {drive.application_deadline}). "
                f"Apply now on PlaceTrack!"
            )
            push_in_app(student.user_id, message, category="warning")
            send_gchat_or_log(f"[Reminder -> {student.user.email}] {message}", webhook, log_path)
            reminders_sent += 1

    current_app.logger.info("Daily reminder job sent %s reminder(s).", reminders_sent)
    return {"reminders_sent": reminders_sent, "drives_checked": len(drives)}


# ---------------------------------------------------------------------------
# (b) Monthly activity report (HTML snapshot + PDF, emailed/logged to admin)
# ---------------------------------------------------------------------------
def _build_report_payload(month: int, year: int) -> dict:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    drives_this_month = PlacementDrive.query.filter(
        PlacementDrive.reviewed_at.isnot(None),
        PlacementDrive.reviewed_at >= start,
        PlacementDrive.reviewed_at < end,
        PlacementDrive.status.in_([DriveStatus.APPROVED, DriveStatus.CLOSED]),
    ).all()

    applications_this_month = Application.query.filter(
        Application.applied_on >= start, Application.applied_on < end
    ).all()

    selected_this_month = [a for a in applications_this_month if a.status == ApplicationStatus.SELECTED]

    top_drives = []
    branch_breakdown = {}
    for drive in drives_this_month:
        apps = drive.applications.all()
        selected = [a for a in apps if a.status == ApplicationStatus.SELECTED]
        top_drives.append(
            {
                "company_name": drive.company.company_name,
                "job_title": drive.job_title,
                "applicant_count": len(apps),
                "selected_count": len(selected),
            }
        )
        for a in selected:
            branch = a.student.branch
            branch_breakdown[branch] = branch_breakdown.get(branch, 0) + 1

    return {
        "month": month,
        "year": year,
        "drives_conducted": len(drives_this_month),
        "students_applied": len(applications_this_month),
        "students_selected": len(selected_this_month),
        "top_drives": top_drives,
        "branch_breakdown": branch_breakdown,
    }


def _render_html_snapshot(payload: dict) -> str:
    rows = "".join(
        f"<tr><td>{d['company_name']}</td><td>{d['job_title']}</td>"
        f"<td>{d['applicant_count']}</td><td>{d['selected_count']}</td></tr>"
        for d in payload["top_drives"]
    )
    return f"""
    <html><body style="font-family: Arial, sans-serif;">
      <h2 style="color:#14213D;">PlaceTrack Monthly Activity Report - {payload['month']}/{payload['year']}</h2>
      <ul>
        <li>Drives conducted: <b>{payload['drives_conducted']}</b></li>
        <li>Students applied: <b>{payload['students_applied']}</b></li>
        <li>Students selected: <b>{payload['students_selected']}</b></li>
      </ul>
      <table border="1" cellpadding="6" cellspacing="0">
        <tr style="background:#EDEEF0;"><th>Company</th><th>Role</th><th>Applicants</th><th>Selected</th></tr>
        {rows}
      </table>
    </body></html>
    """


@celery.task(name="app.tasks.generate_monthly_activity_report")
def generate_monthly_activity_report(month: int = None, year: int = None):
    """Runs on the 1st of the month to summarise the *previous* month, unless
    month/year are explicitly passed (used by the "generate now" admin
    button for demo purposes during a viva)."""
    if month is None or year is None:
        today = date.today()
        prev_last_day = today.replace(day=1) - timedelta(days=1)
        month, year = prev_last_day.month, prev_last_day.year

    payload = _build_report_payload(month, year)
    html_snapshot = _render_html_snapshot(payload)

    filename = f"placetrack_report_{year}_{month:02d}.pdf"
    output_path = os.path.join(current_app.config["REPORT_DIR"], filename)
    generate_monthly_report_pdf(payload, output_path)

    existing = MonthlyReport.query.filter_by(month=month, year=year).first()
    if existing:
        existing.drives_conducted = payload["drives_conducted"]
        existing.students_applied = payload["students_applied"]
        existing.students_selected = payload["students_selected"]
        existing.pdf_path = f"exports/reports/{filename}"
        existing.html_snapshot = html_snapshot
        existing.generated_at = datetime.utcnow()
    else:
        db.session.add(
            MonthlyReport(
                month=month,
                year=year,
                drives_conducted=payload["drives_conducted"],
                students_applied=payload["students_applied"],
                students_selected=payload["students_selected"],
                pdf_path=f"exports/reports/{filename}",
                html_snapshot=html_snapshot,
            )
        )
    db.session.commit()

    admin = User.query.filter_by(role="admin").first()
    if admin:
        month_label = f"{month:02d}/{year}"
        push_in_app(
            admin.id,
            f"Monthly report for {month_label} is ready ({payload['drives_conducted']} drives, "
            f"{payload['students_selected']} selections).",
            category="success",
        )
        send_email_or_log(
            subject=f"PlaceTrack Monthly Activity Report - {month_label}",
            html_body=html_snapshot,
            to_email=admin.email,
            log_path=current_app.config["NOTIFICATION_LOG_PATH"],
            mail_server=current_app.config["MAIL_SERVER"],
            mail_port=current_app.config["MAIL_PORT"],
            mail_use_tls=current_app.config["MAIL_USE_TLS"],
            mail_username=current_app.config["MAIL_USERNAME"],
            mail_password=current_app.config["MAIL_PASSWORD"],
            mail_sender=current_app.config["MAIL_DEFAULT_SENDER"],
            attachment_path=output_path,
            attachment_name=filename,
        )

    return {"month": month, "year": year, "pdf_path": output_path}


# ---------------------------------------------------------------------------
# (c) User-triggered async job: export a student's applications as CSV
# ---------------------------------------------------------------------------
@celery.task(name="app.tasks.export_applications_csv", bind=True)
def export_applications_csv(self, student_profile_id: int):
    student = StudentProfile.query.get(student_profile_id)
    if student is None:
        return {"error": "Student not found"}

    applications = (
        Application.query.filter_by(student_id=student.id)
        .order_by(Application.applied_on.desc())
        .all()
    )

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"applications_{student.roll_number}_{timestamp}.csv"
    output_path = os.path.join(current_app.config["CSV_EXPORT_DIR"], filename)

    with open(output_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["Student ID", "Company Name", "Drive Title", "Application Status", "Applied On", "Last Updated"]
        )
        for app_row in applications:
            writer.writerow(
                [
                    student.roll_number,
                    app_row.drive.company.company_name,
                    app_row.drive.job_title,
                    app_row.status,
                    app_row.applied_on.strftime("%Y-%m-%d %H:%M"),
                    app_row.updated_at.strftime("%Y-%m-%d %H:%M") if app_row.updated_at else "",
                ]
            )

    push_in_app(
        student.user_id,
        f"Your application history export is ready: {filename}",
        category="success",
    )
    send_gchat_or_log(
        f"[Export ready -> {student.user.email}] {filename}",
        current_app.config["GCHAT_WEBHOOK_URL"],
        current_app.config["NOTIFICATION_LOG_PATH"],
    )

    return {"filename": filename, "row_count": len(applications)}
