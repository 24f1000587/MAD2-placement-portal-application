import os

from flask import Blueprint, request, jsonify, current_app, send_from_directory
from sqlalchemy import or_

from app.extensions import db, cache
from app.models import (
    User,
    Role,
    StudentProfile,
    CompanyProfile,
    PlacementDrive,
    Application,
    ApplicationStatus,
    ApprovalStatus,
    DriveStatus,
    MonthlyReport,
)
from app.utils.decorators import role_required
from app.utils.notify import push_in_app
from app.tasks import generate_monthly_activity_report

admin_bp = Blueprint("admin", __name__)

DASHBOARD_CACHE_KEY = "cache:admin_dashboard"


def _invalidate_dashboard_cache():
    cache.delete(DASHBOARD_CACHE_KEY)


def _invalidate_open_drives_cache():
    cache.delete("cache:open_drives")


# Dashboard

@admin_bp.get("/dashboard")
@role_required("admin")
def dashboard():
    cached = cache.get(DASHBOARD_CACHE_KEY)
    if cached is not None:
        return jsonify(cached)

    total_students = StudentProfile.query.count()
    total_companies = CompanyProfile.query.count()
    approved_companies = CompanyProfile.query.filter_by(approval_status=ApprovalStatus.APPROVED).count()
    pending_companies = CompanyProfile.query.filter_by(approval_status=ApprovalStatus.PENDING).count()
    total_drives = PlacementDrive.query.count()
    pending_drives = PlacementDrive.query.filter_by(status=DriveStatus.PENDING).count()
    approved_drives = PlacementDrive.query.filter_by(status=DriveStatus.APPROVED).count()
    total_applications = Application.query.count()
    total_selected = Application.query.filter_by(status=ApplicationStatus.SELECTED).count()

    branch_rows = (
        db.session.query(StudentProfile.branch, db.func.count(StudentProfile.id))
        .group_by(StudentProfile.branch)
        .all()
    )

    payload = {
        "total_students": total_students,
        "total_companies": total_companies,
        "approved_companies": approved_companies,
        "pending_companies": pending_companies,
        "total_drives": total_drives,
        "pending_drives": pending_drives,
        "approved_drives": approved_drives,
        "total_applications": total_applications,
        "total_selected": total_selected,
        "students_by_branch": {b: c for b, c in branch_rows},
    }
    cache.set(DASHBOARD_CACHE_KEY, payload, timeout=60)
    return jsonify(payload)


# Companies
@admin_bp.get("/companies")
@role_required("admin")
def list_companies():
    status_filter = request.args.get("status")
    search = (request.args.get("q") or "").strip()

    query = CompanyProfile.query.join(User)
    if status_filter:
        query = query.filter(CompanyProfile.approval_status == status_filter)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(CompanyProfile.company_name.ilike(like), User.email.ilike(like)))

    companies = query.order_by(CompanyProfile.id.desc()).all()
    return jsonify(companies=[c.to_dict() for c in companies])


@admin_bp.post("/companies/<int:company_id>/approve")
@role_required("admin")
def approve_company(company_id):
    from datetime import datetime

    company = CompanyProfile.query.get_or_404(company_id)
    company.approval_status = ApprovalStatus.APPROVED
    company.reviewed_at = datetime.utcnow()
    db.session.commit()
    push_in_app(company.user_id, "Your company profile has been approved. You can now create placement drives.", "success")
    _invalidate_dashboard_cache()
    return jsonify(company=company.to_dict())


@admin_bp.post("/companies/<int:company_id>/reject")
@role_required("admin")
def reject_company(company_id):
    from datetime import datetime

    company = CompanyProfile.query.get_or_404(company_id)
    payload = request.get_json(silent=True) or {}
    company.approval_status = ApprovalStatus.REJECTED
    company.reviewed_at = datetime.utcnow()
    db.session.commit()
    reason = payload.get("reason", "")
    push_in_app(company.user_id, f"Your company registration was rejected. {reason}".strip(), "danger")
    _invalidate_dashboard_cache()
    return jsonify(company=company.to_dict())


@admin_bp.post("/companies/<int:company_id>/blacklist")
@role_required("admin")
def blacklist_company(company_id):
    company = CompanyProfile.query.get_or_404(company_id)
    payload = request.get_json(silent=True) or {}
    company.user.is_blacklisted = True
    company.user.blacklist_reason = payload.get("reason", "Policy violation.")
    db.session.commit()
    push_in_app(company.user_id, f"Your account has been blacklisted. Reason: {company.user.blacklist_reason}", "danger")
    _invalidate_dashboard_cache()
    _invalidate_open_drives_cache()
    return jsonify(company=company.to_dict())


@admin_bp.post("/companies/<int:company_id>/reactivate")
@role_required("admin")
def reactivate_company(company_id):
    company = CompanyProfile.query.get_or_404(company_id)
    company.user.is_blacklisted = False
    company.user.blacklist_reason = None
    company.user.is_active = True
    db.session.commit()
    push_in_app(company.user_id, "Your account has been reactivated.", "success")
    _invalidate_dashboard_cache()
    return jsonify(company=company.to_dict())


@admin_bp.post("/companies/<int:company_id>/deactivate")
@role_required("admin")
def deactivate_company(company_id):
    company = CompanyProfile.query.get_or_404(company_id)
    company.user.is_active = False
    db.session.commit()
    _invalidate_dashboard_cache()
    _invalidate_open_drives_cache()
    return jsonify(company=company.to_dict())


# ---------------------------------------------------------------------------
# Students
# ---------------------------------------------------------------------------
@admin_bp.get("/students")
@role_required("admin")
def list_students():
    search = (request.args.get("q") or "").strip()
    branch = request.args.get("branch")

    query = StudentProfile.query.join(User)
    if branch:
        query = query.filter(StudentProfile.branch == branch)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(User.name.ilike(like), User.email.ilike(like), StudentProfile.roll_number.ilike(like))
        )

    students = query.order_by(StudentProfile.id.desc()).all()
    return jsonify(students=[s.to_dict() for s in students])


@admin_bp.post("/students/<int:student_id>/blacklist")
@role_required("admin")
def blacklist_student(student_id):
    student = StudentProfile.query.get_or_404(student_id)
    payload = request.get_json(silent=True) or {}
    student.user.is_blacklisted = True
    student.user.blacklist_reason = payload.get("reason", "Policy violation.")
    db.session.commit()
    push_in_app(student.user_id, f"Your account has been blacklisted. Reason: {student.user.blacklist_reason}", "danger")
    _invalidate_dashboard_cache()
    return jsonify(student=student.to_dict())


@admin_bp.post("/students/<int:student_id>/reactivate")
@role_required("admin")
def reactivate_student(student_id):
    student = StudentProfile.query.get_or_404(student_id)
    student.user.is_blacklisted = False
    student.user.blacklist_reason = None
    student.user.is_active = True
    db.session.commit()
    push_in_app(student.user_id, "Your account has been reactivated.", "success")
    _invalidate_dashboard_cache()
    return jsonify(student=student.to_dict())


@admin_bp.post("/students/<int:student_id>/deactivate")
@role_required("admin")
def deactivate_student(student_id):
    student = StudentProfile.query.get_or_404(student_id)
    student.user.is_active = False
    db.session.commit()
    _invalidate_dashboard_cache()
    return jsonify(student=student.to_dict())


# Drives
@admin_bp.get("/drives")
@role_required("admin")
def list_drives():
    status_filter = request.args.get("status")
    query = PlacementDrive.query
    if status_filter:
        query = query.filter_by(status=status_filter)
    drives = query.order_by(PlacementDrive.created_at.desc()).all()
    return jsonify(
        drives=[{**d.to_dict(), "applicant_count": d.applications.count()} for d in drives]
    )


@admin_bp.post("/drives/<int:drive_id>/approve")
@role_required("admin")
def approve_drive(drive_id):
    from datetime import datetime

    drive = PlacementDrive.query.get_or_404(drive_id)
    drive.status = DriveStatus.APPROVED
    drive.reviewed_at = datetime.utcnow()
    db.session.commit()
    push_in_app(drive.company.user_id, f"Your drive '{drive.job_title}' has been approved and is now live.", "success")
    _invalidate_dashboard_cache()
    _invalidate_open_drives_cache()
    return jsonify(drive=drive.to_dict())


@admin_bp.post("/drives/<int:drive_id>/reject")
@role_required("admin")
def reject_drive(drive_id):
    from datetime import datetime

    drive = PlacementDrive.query.get_or_404(drive_id)
    payload = request.get_json(silent=True) or {}
    drive.status = DriveStatus.REJECTED
    drive.rejection_reason = payload.get("reason", "")
    drive.reviewed_at = datetime.utcnow()
    db.session.commit()
    push_in_app(drive.company.user_id, f"Your drive '{drive.job_title}' was rejected. {drive.rejection_reason}".strip(), "danger")
    _invalidate_dashboard_cache()
    return jsonify(drive=drive.to_dict())


# Global search
@admin_bp.get("/search")
@role_required("admin")
def global_search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify(students=[], companies=[], drives=[])
    like = f"%{q}%"

    students = (
        StudentProfile.query.join(User)
        .filter(or_(User.name.ilike(like), User.email.ilike(like), StudentProfile.roll_number.ilike(like)))
        .limit(10)
        .all()
    )
    companies = (
        CompanyProfile.query.join(User)
        .filter(or_(CompanyProfile.company_name.ilike(like), User.email.ilike(like)))
        .limit(10)
        .all()
    )
    drives = PlacementDrive.query.filter(PlacementDrive.job_title.ilike(like)).limit(10).all()

    return jsonify(
        students=[s.to_dict() for s in students],
        companies=[c.to_dict() for c in companies],
        drives=[d.to_dict() for d in drives],
    )


# Monthly reports (optional feature: PDF reports)
@admin_bp.get("/reports/monthly")
@role_required("admin")
def list_reports():
    reports = MonthlyReport.query.order_by(MonthlyReport.year.desc(), MonthlyReport.month.desc()).all()
    return jsonify(reports=[r.to_dict() for r in reports])


@admin_bp.post("/reports/monthly/generate")
@role_required("admin")
def generate_report_now():
    """Lets the admin trigger the monthly report job on demand (handy for a
    live viva instead of waiting for the 1st of the month)."""
    payload = request.get_json(silent=True) or {}
    month = payload.get("month")
    year = payload.get("year")
    task = generate_monthly_activity_report.delay(month, year) if (month and year) else generate_monthly_activity_report.delay()
    return jsonify(task_id=task.id, message="Report generation started."), 202


@admin_bp.get("/reports/monthly/task-status/<task_id>")
@role_required("admin")
def report_task_status(task_id):
    task = generate_monthly_activity_report.AsyncResult(task_id)
    response = {"task_id": task_id, "state": task.state}
    if task.state == "SUCCESS":
        response["result"] = task.result
    elif task.state == "FAILURE":
        response["error"] = str(task.info)
    return jsonify(response)


@admin_bp.get("/reports/monthly/<int:report_id>/download")
@role_required("admin")
def download_report(report_id):
    report = MonthlyReport.query.get_or_404(report_id)
    if not report.pdf_path:
        return jsonify(error="PDF not available for this report."), 404
    filename = os.path.basename(report.pdf_path)
    return send_from_directory(current_app.config["REPORT_DIR"], filename, as_attachment=True)
