import os
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import get_jwt_identity

from app.extensions import db, cache
from app.models import (
    CompanyProfile,
    PlacementDrive,
    Application,
    ApplicationStatus,
    DriveStatus,
    ApprovalStatus,
)
from app.utils.decorators import role_required, company_must_be_approved
from app.utils.validators import ValidationError, require_fields, validate_cgpa, validate_future_date
from app.utils.notify import push_in_app
from app.utils.pdf_generator import generate_offer_letter_pdf

company_bp = Blueprint("company", __name__)


def _current_company() -> CompanyProfile:
    user_id = int(get_jwt_identity())
    return CompanyProfile.query.filter_by(user_id=user_id).first_or_404(
        description="Company profile not found."
    )


def _invalidate_open_drives_cache():
    cache.delete("cache:open_drives")



# Profile
@company_bp.get("/profile")
@role_required("company")
def get_profile():
    company = _current_company()
    return jsonify(profile=company.to_dict())


@company_bp.put("/profile")
@role_required("company")
def update_profile():
    company = _current_company()
    payload = request.get_json(silent=True) or {}
    for field in ("hr_contact_name", "hr_contact_email", "hr_phone", "website", "industry", "description"):
        if field in payload:
            setattr(company, field, (payload[field] or "").strip() or None)
    db.session.commit()
    return jsonify(profile=company.to_dict())


# Dashboard
@company_bp.get("/dashboard")
@role_required("company")
def dashboard():
    company = _current_company()
    drives = company.drives.all()
    per_drive = []
    total_applicants = 0
    total_selected = 0
    for d in drives:
        apps = d.applications.all()
        selected = sum(1 for a in apps if a.status == ApplicationStatus.SELECTED)
        total_applicants += len(apps)
        total_selected += selected
        per_drive.append({**d.to_dict(include_company=False), "applicant_count": len(apps), "selected_count": selected})

    return jsonify(
        approval_status=company.approval_status,
        total_drives=len(drives),
        total_applicants=total_applicants,
        total_selected=total_selected,
        drives=per_drive,
    )


# Drives
@company_bp.post("/drives")
@role_required("company")
@company_must_be_approved
def create_drive():
    company = _current_company()
    payload = request.get_json(silent=True) or {}
    try:
        require_fields(
            payload,
            ["job_title", "job_description", "eligible_branches", "eligible_years", "application_deadline"],
        )
        min_cgpa = validate_cgpa(payload.get("min_cgpa", 0))
        deadline = validate_future_date(payload["application_deadline"], "application_deadline")
    except ValidationError as exc:
        return jsonify(error=exc.message, field=exc.field), 400

    branches = payload["eligible_branches"]
    years = payload["eligible_years"]
    if isinstance(branches, list):
        branches = ",".join(str(b).strip() for b in branches)
    if isinstance(years, list):
        years = ",".join(str(y).strip() for y in years)

    drive_date = None
    if payload.get("drive_date"):
        from app.utils.validators import parse_date

        drive_date = parse_date(payload["drive_date"], "drive_date")

    drive = PlacementDrive(
        company_id=company.id,
        job_title=payload["job_title"].strip(),
        job_description=payload["job_description"].strip(),
        eligible_branches=branches,
        min_cgpa=min_cgpa,
        eligible_years=years,
        package_lpa=payload.get("package_lpa"),
        location=(payload.get("location") or "").strip() or None,
        application_deadline=deadline,
        drive_date=drive_date,
        status=DriveStatus.PENDING,
    )
    db.session.add(drive)
    db.session.commit()

    return jsonify(drive=drive.to_dict(), message="Drive submitted for admin approval."), 201


@company_bp.get("/drives")
@role_required("company")
def list_drives():
    company = _current_company()
    status_filter = request.args.get("status")
    query = company.drives
    if status_filter:
        query = query.filter_by(status=status_filter)
    drives = query.order_by(PlacementDrive.created_at.desc()).all()
    return jsonify(
        drives=[{**d.to_dict(include_company=False), "applicant_count": d.applications.count()} for d in drives]
    )


@company_bp.put("/drives/<int:drive_id>")
@role_required("company")
def update_drive(drive_id):
    company = _current_company()
    drive = PlacementDrive.query.filter_by(id=drive_id, company_id=company.id).first_or_404()
    if drive.status != DriveStatus.PENDING:
        return jsonify(error="Only drives still pending approval can be edited."), 400

    payload = request.get_json(silent=True) or {}
    for field in ("job_title", "job_description", "location"):
        if field in payload:
            setattr(drive, field, (payload[field] or "").strip())
    if "package_lpa" in payload:
        drive.package_lpa = payload["package_lpa"]
    if "min_cgpa" in payload:
        try:
            drive.min_cgpa = validate_cgpa(payload["min_cgpa"])
        except ValidationError as exc:
            return jsonify(error=exc.message, field=exc.field), 400
    if "eligible_branches" in payload:
        val = payload["eligible_branches"]
        drive.eligible_branches = ",".join(val) if isinstance(val, list) else val
    if "eligible_years" in payload:
        val = payload["eligible_years"]
        drive.eligible_years = ",".join(str(y) for y in val) if isinstance(val, list) else val
    if "application_deadline" in payload:
        try:
            drive.application_deadline = validate_future_date(payload["application_deadline"], "application_deadline")
        except ValidationError as exc:
            return jsonify(error=exc.message, field=exc.field), 400

    db.session.commit()
    return jsonify(drive=drive.to_dict())


@company_bp.post("/drives/<int:drive_id>/close")
@role_required("company")
def close_drive(drive_id):
    company = _current_company()
    drive = PlacementDrive.query.filter_by(id=drive_id, company_id=company.id).first_or_404()
    drive.status = DriveStatus.CLOSED
    db.session.commit()
    _invalidate_open_drives_cache()
    return jsonify(drive=drive.to_dict())


# Applicants
@company_bp.get("/drives/<int:drive_id>/applicants")
@role_required("company")
def drive_applicants(drive_id):
    company = _current_company()
    drive = PlacementDrive.query.filter_by(id=drive_id, company_id=company.id).first_or_404()
    status_filter = request.args.get("status")
    query = drive.applications
    if status_filter:
        query = query.filter_by(status=status_filter)
    applications = query.order_by(Application.applied_on.asc()).all()
    return jsonify(
        drive=drive.to_dict(include_company=False),
        applicants=[a.to_dict(include_drive=False, include_student=True) for a in applications],
    )


ALLOWED_TRANSITIONS = {
    ApplicationStatus.APPLIED: {ApplicationStatus.SHORTLISTED, ApplicationStatus.REJECTED},
    ApplicationStatus.SHORTLISTED: {ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.REJECTED},
    ApplicationStatus.INTERVIEW_SCHEDULED: {ApplicationStatus.SELECTED, ApplicationStatus.REJECTED},
    ApplicationStatus.SELECTED: set(),
    ApplicationStatus.REJECTED: set(),
}


@company_bp.put("/applications/<int:application_id>/status")
@role_required("company")
def update_application_status(application_id):
    company = _current_company()
    application = Application.query.get_or_404(application_id)
    if application.drive.company_id != company.id:
        return jsonify(error="You do not own this application's drive."), 403

    payload = request.get_json(silent=True) or {}
    new_status = payload.get("status")
    if new_status not in ApplicationStatus.ORDER:
        return jsonify(error="Invalid status value."), 400
    if new_status not in ALLOWED_TRANSITIONS.get(application.status, set()):
        return (
            jsonify(error=f"Cannot move an application from '{application.status}' to '{new_status}'."),
            400,
        )

    application.status = new_status
    if payload.get("remarks"):
        application.remarks = payload["remarks"].strip()
    if new_status == ApplicationStatus.INTERVIEW_SCHEDULED and payload.get("interview_datetime"):
        try:
            application.interview_datetime = datetime.fromisoformat(payload["interview_datetime"])
        except ValueError:
            return jsonify(error="interview_datetime must be an ISO 8601 datetime."), 400

    db.session.commit()

    status_messages = {
        ApplicationStatus.SHORTLISTED: f"You have been shortlisted for '{application.drive.job_title}'!",
        ApplicationStatus.INTERVIEW_SCHEDULED: f"Interview scheduled for '{application.drive.job_title}'.",
        ApplicationStatus.SELECTED: f"Congratulations! You have been selected for '{application.drive.job_title}'.",
        ApplicationStatus.REJECTED: f"Update on '{application.drive.job_title}': application not selected this time.",
    }
    category = "success" if new_status == ApplicationStatus.SELECTED else "info"
    if new_status == ApplicationStatus.REJECTED:
        category = "warning"
    push_in_app(application.student.user_id, status_messages.get(new_status, "Application updated."), category=category)

    return jsonify(application=application.to_dict())


# Offer letter (optional feature)
@company_bp.post("/applications/<int:application_id>/offer-letter")
@role_required("company")
def generate_offer_letter(application_id):
    company = _current_company()
    application = Application.query.get_or_404(application_id)
    if application.drive.company_id != company.id:
        return jsonify(error="You do not own this application's drive."), 403
    if application.status != ApplicationStatus.SELECTED:
        return jsonify(error="Only selected candidates can receive an offer letter."), 400

    drive = application.drive
    student = application.student
    filename = f"offer_{student.roll_number}_{drive.id}.pdf"
    output_path = os.path.join(current_app.config["OFFER_LETTER_DIR"], filename)
    generate_offer_letter_pdf(
        {
            "student_name": student.user.name,
            "roll_number": student.roll_number,
            "branch": student.branch,
            "company_name": company.company_name,
            "job_title": drive.job_title,
            "package_lpa": drive.package_lpa or "N/A",
            "drive_date": drive.drive_date.isoformat() if drive.drive_date else "N/A",
            "hr_contact_name": company.hr_contact_name,
        },
        output_path,
    )
    application.offer_letter_path = f"exports/offer_letters/{filename}"
    db.session.commit()

    push_in_app(student.user_id, f"Your offer letter for '{drive.job_title}' is ready to download.", category="success")

    return jsonify(application=application.to_dict(), message="Offer letter generated.")


@company_bp.get("/applications/<int:application_id>/offer-letter")
@role_required("company")
def download_offer_letter(application_id):
    company = _current_company()
    application = Application.query.get_or_404(application_id)
    if application.drive.company_id != company.id:
        return jsonify(error="You do not own this application's drive."), 403
    if not application.offer_letter_path:
        return jsonify(error="No offer letter generated yet."), 404
    filename = os.path.basename(application.offer_letter_path)
    return send_from_directory(current_app.config["OFFER_LETTER_DIR"], filename, as_attachment=True)
