import os

from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import get_jwt_identity
from werkzeug.utils import secure_filename

from app.extensions import db, cache
from app.models import (
    StudentProfile,
    PlacementDrive,
    Application,
    ApplicationStatus,
    DriveStatus,
    User,
)
from app.utils.decorators import role_required
from app.utils.validators import ValidationError, validate_cgpa, validate_year
from app.utils.notify import push_in_app
from app.tasks import export_applications_csv

student_bp = Blueprint("student", __name__)

OPEN_DRIVES_CACHE_KEY = "cache:open_drives"


def _current_student() -> StudentProfile:
    user_id = int(get_jwt_identity())
    return StudentProfile.query.filter_by(user_id=user_id).first_or_404(
        description="Student profile not found."
    )


# Profile
@student_bp.get("/profile")
@role_required("student")
def get_profile():
    student = _current_student()
    return jsonify(profile=student.to_dict())


@student_bp.put("/profile")
@role_required("student")
def update_profile():
    student = _current_student()
    payload = request.get_json(silent=True) or {}

    try:
        if "cgpa" in payload:
            student.cgpa = validate_cgpa(payload["cgpa"])
        if "graduation_year" in payload:
            student.graduation_year = validate_year(payload["graduation_year"])
    except ValidationError as exc:
        return jsonify(error=exc.message, field=exc.field), 400

    for field in ("branch", "phone", "skills"):
        if field in payload:
            setattr(student, field, (payload[field] or "").strip() or None)

    if "name" in payload and payload["name"].strip():
        student.user.name = payload["name"].strip()

    db.session.commit()
    return jsonify(profile=student.to_dict())


@student_bp.post("/profile/resume")
@role_required("student")
def upload_resume():
    student = _current_student()
    if "resume" not in request.files:
        return jsonify(error="No file part named 'resume' in the request."), 400

    file = request.files["resume"]
    if file.filename == "":
        return jsonify(error="No file selected."), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in current_app.config["ALLOWED_RESUME_EXTENSIONS"]:
        return jsonify(error="Only PDF, DOC, or DOCX files are allowed."), 400

    filename = secure_filename(f"resume_{student.roll_number}.{ext}")
    save_path = os.path.join(current_app.config["RESUME_UPLOAD_DIR"], filename)
    file.save(save_path)

    student.resume_filename = filename
    from datetime import datetime

    student.resume_uploaded_at = datetime.utcnow()
    db.session.commit()

    return jsonify(profile=student.to_dict(), message="Resume uploaded successfully.")


@student_bp.get("/profile/resume")
@role_required("student")
def download_resume():
    student = _current_student()
    if not student.resume_filename:
        return jsonify(error="No resume uploaded yet."), 404
    return send_from_directory(
        current_app.config["RESUME_UPLOAD_DIR"], student.resume_filename, as_attachment=True
    )


# Dashboard
@student_bp.get("/dashboard")
@role_required("student")
def dashboard():
    student = _current_student()
    applications = student.applications.all()
    status_counts = {status: 0 for status in ApplicationStatus.ORDER}
    for a in applications:
        status_counts[a.status] = status_counts.get(a.status, 0) + 1

    from datetime import date, timedelta

    upcoming_cutoff = date.today() + timedelta(days=7)
    open_drives = PlacementDrive.query.filter(
        PlacementDrive.status == DriveStatus.APPROVED,
        PlacementDrive.application_deadline >= date.today(),
        PlacementDrive.application_deadline <= upcoming_cutoff,
    ).all()
    eligible_upcoming = [d for d in open_drives if d.is_eligible_for(student)]

    return jsonify(
        total_applications=len(applications),
        status_breakdown=status_counts,
        resume_on_file=bool(student.resume_filename),
        upcoming_deadlines=[d.to_dict() for d in eligible_upcoming],
    )


# Browse drives
def _serialize_open_drives():
    """Cached base dataset: every currently-open, approved drive."""
    from datetime import date

    drives = PlacementDrive.query.filter(
        PlacementDrive.status == DriveStatus.APPROVED,
        PlacementDrive.application_deadline >= date.today(),
    ).all()
    return [
        {**d.to_dict(), "min_cgpa": d.min_cgpa, "_branches": d.branch_list(), "_years": d.year_list()}
        for d in drives
    ]


@student_bp.get("/drives")
@role_required("student")
def browse_drives():
    student = _current_student()

    cached = cache.get(OPEN_DRIVES_CACHE_KEY)
    if cached is None:
        cached = _serialize_open_drives()
        cache.set(OPEN_DRIVES_CACHE_KEY, cached, timeout=60)

    search = (request.args.get("q") or "").lower().strip()
    eligible_only = request.args.get("eligible_only", "false").lower() == "true"

    applied_drive_ids = {a.drive_id for a in student.applications.all()}

    results = []
    for d in cached:
        if search and search not in d["job_title"].lower() and search not in d["company_name"].lower():
            continue
        is_eligible = (
            student.branch in d["_branches"]
            and student.graduation_year in d["_years"]
            and student.cgpa >= d["min_cgpa"]
        )
        if eligible_only and not is_eligible:
            continue
        row = {k: v for k, v in d.items() if not k.startswith("_")}
        row["is_eligible"] = is_eligible
        row["already_applied"] = d["id"] in applied_drive_ids
        results.append(row)

    return jsonify(drives=results, count=len(results))


@student_bp.get("/drives/<int:drive_id>")
@role_required("student")
def drive_detail(drive_id):
    student = _current_student()
    drive = PlacementDrive.query.filter_by(id=drive_id, status=DriveStatus.APPROVED).first_or_404()
    data = drive.to_dict()
    data["is_eligible"] = drive.is_eligible_for(student)
    data["already_applied"] = Application.query.filter_by(
        student_id=student.id, drive_id=drive.id
    ).first() is not None
    return jsonify(drive=data)


# Apply
@student_bp.post("/drives/<int:drive_id>/apply")
@role_required("student")
def apply_to_drive(drive_id):
    student = _current_student()
    drive = PlacementDrive.query.get_or_404(drive_id)

    if not drive.is_open():
        return jsonify(error="This drive is not currently open for applications."), 400
    if not drive.is_eligible_for(student):
        return jsonify(error="You do not meet the eligibility criteria for this drive."), 403
    if Application.query.filter_by(student_id=student.id, drive_id=drive.id).first():
        return jsonify(error="You have already applied to this drive."), 409

    application = Application(student_id=student.id, drive_id=drive.id, status=ApplicationStatus.APPLIED)
    db.session.add(application)
    db.session.commit()

    push_in_app(
        drive.company.user_id,
        f"{student.user.name} applied for '{drive.job_title}'.",
        category="info",
    )

    return jsonify(application=application.to_dict()), 201


# My applications / history
@student_bp.get("/applications")
@role_required("student")
def my_applications():
    student = _current_student()
    status_filter = request.args.get("status")
    query = Application.query.filter_by(student_id=student.id)
    if status_filter:
        query = query.filter_by(status=status_filter)
    applications = query.order_by(Application.applied_on.desc()).all()
    return jsonify(applications=[a.to_dict() for a in applications])


@student_bp.get("/history")
@role_required("student")
def placement_history():
    student = _current_student()
    selected = Application.query.filter_by(
        student_id=student.id, status=ApplicationStatus.SELECTED
    ).all()
    return jsonify(history=[a.to_dict() for a in selected])


@student_bp.get("/applications/<int:application_id>/offer-letter")
@role_required("student")
def download_offer_letter(application_id):
    student = _current_student()
    application = Application.query.filter_by(id=application_id, student_id=student.id).first_or_404()
    if not application.offer_letter_path:
        return jsonify(error="No offer letter has been generated for this application yet."), 404
    filename = os.path.basename(application.offer_letter_path)
    return send_from_directory(current_app.config["OFFER_LETTER_DIR"], filename, as_attachment=True)


# Async CSV export (Celery)
@student_bp.post("/export")
@role_required("student")
def trigger_export():
    student = _current_student()
    task = export_applications_csv.delay(student.id)
    return jsonify(task_id=task.id, message="Export started. We'll notify you when it's ready."), 202


@student_bp.get("/export/status/<task_id>")
@role_required("student")
def export_status(task_id):
    task = export_applications_csv.AsyncResult(task_id)
    response = {"task_id": task_id, "state": task.state}
    if task.state == "SUCCESS":
        response["result"] = task.result
    elif task.state == "FAILURE":
        response["error"] = str(task.info)
    return jsonify(response)


@student_bp.get("/export/download/<path:filename>")
@role_required("student")
def download_export(filename):
    return send_from_directory(
        current_app.config["CSV_EXPORT_DIR"], secure_filename(filename), as_attachment=True
    )
