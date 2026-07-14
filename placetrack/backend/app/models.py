"""
Database models for PlaceTrack.

A single `User` table backs authentication for all three roles (admin,
student, company) as required by the spec ("a unified user model to
differentiate all types of user roles"). Role-specific attributes live in
`StudentProfile` / `CompanyProfile`, each in a 1-to-1 relationship with a
`User`.
"""
from datetime import datetime, date

from werkzeug.security import generate_password_hash, check_password_hash

from app.extensions import db


# ---------------------------------------------------------------------------
# Enums (stored as plain strings for SQLite simplicity, validated in code)
# ---------------------------------------------------------------------------
class Role:
    ADMIN = "admin"
    STUDENT = "student"
    COMPANY = "company"
    ALL = (ADMIN, STUDENT, COMPANY)


class ApprovalStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ALL = (PENDING, APPROVED, REJECTED)


class DriveStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CLOSED = "closed"
    ALL = (PENDING, APPROVED, REJECTED, CLOSED)


class ApplicationStatus:
    APPLIED = "applied"
    SHORTLISTED = "shortlisted"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    SELECTED = "selected"
    REJECTED = "rejected"
    ORDER = (APPLIED, SHORTLISTED, INTERVIEW_SCHEDULED, SELECTED, REJECTED)


# ---------------------------------------------------------------------------
# Core identity
# ---------------------------------------------------------------------------
class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)

    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_blacklisted = db.Column(db.Boolean, default=False, nullable=False)
    blacklist_reason = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    student_profile = db.relationship(
        "StudentProfile", backref="user", uselist=False, cascade="all, delete-orphan"
    )
    company_profile = db.relationship(
        "CompanyProfile", backref="user", uselist=False, cascade="all, delete-orphan"
    )
    notifications = db.relationship(
        "Notification", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )

    # -- password helpers ---------------------------------------------------
    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    @property
    def can_login(self) -> bool:
        return self.is_active and not self.is_blacklisted

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "is_active": self.is_active,
            "is_blacklisted": self.is_blacklisted,
            "blacklist_reason": self.blacklist_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


# ---------------------------------------------------------------------------
# Student
# ---------------------------------------------------------------------------
class StudentProfile(db.Model):
    __tablename__ = "student_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)

    roll_number = db.Column(db.String(40), unique=True, nullable=False)
    branch = db.Column(db.String(80), nullable=False)
    graduation_year = db.Column(db.Integer, nullable=False)
    cgpa = db.Column(db.Float, nullable=False, default=0.0)
    phone = db.Column(db.String(20), nullable=True)
    skills = db.Column(db.String(400), nullable=True)  # comma-separated
    resume_filename = db.Column(db.String(255), nullable=True)
    resume_uploaded_at = db.Column(db.DateTime, nullable=True)

    applications = db.relationship(
        "Application", backref="student", lazy="dynamic", cascade="all, delete-orphan"
    )

    def to_dict(self, include_user=True):
        data = {
            "id": self.id,
            "roll_number": self.roll_number,
            "branch": self.branch,
            "graduation_year": self.graduation_year,
            "cgpa": self.cgpa,
            "phone": self.phone,
            "skills": self.skills,
            "resume_filename": self.resume_filename,
        }
        if include_user and self.user:
            data.update(
                {
                    "user_id": self.user.id,
                    "name": self.user.name,
                    "email": self.user.email,
                    "is_active": self.user.is_active,
                    "is_blacklisted": self.user.is_blacklisted,
                }
            )
        return data


# ---------------------------------------------------------------------------
# Company
# ---------------------------------------------------------------------------
class CompanyProfile(db.Model):
    __tablename__ = "company_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)

    company_name = db.Column(db.String(150), nullable=False)
    hr_contact_name = db.Column(db.String(120), nullable=False)
    hr_contact_email = db.Column(db.String(150), nullable=False)
    hr_phone = db.Column(db.String(20), nullable=True)
    website = db.Column(db.String(200), nullable=True)
    industry = db.Column(db.String(120), nullable=True)
    description = db.Column(db.Text, nullable=True)

    approval_status = db.Column(db.String(20), default=ApprovalStatus.PENDING, nullable=False)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    drives = db.relationship(
        "PlacementDrive", backref="company", lazy="dynamic", cascade="all, delete-orphan"
    )

    def to_dict(self, include_user=True):
        data = {
            "id": self.id,
            "company_name": self.company_name,
            "hr_contact_name": self.hr_contact_name,
            "hr_contact_email": self.hr_contact_email,
            "hr_phone": self.hr_phone,
            "website": self.website,
            "industry": self.industry,
            "description": self.description,
            "approval_status": self.approval_status,
        }
        if include_user and self.user:
            data.update(
                {
                    "user_id": self.user.id,
                    "email": self.user.email,
                    "is_active": self.user.is_active,
                    "is_blacklisted": self.user.is_blacklisted,
                }
            )
        return data


# ---------------------------------------------------------------------------
# Placement Drive
# ---------------------------------------------------------------------------
class PlacementDrive(db.Model):
    __tablename__ = "placement_drives"

    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey("company_profiles.id"), nullable=False)

    job_title = db.Column(db.String(150), nullable=False)
    job_description = db.Column(db.Text, nullable=False)

    eligible_branches = db.Column(db.String(300), nullable=False)  # comma-separated
    min_cgpa = db.Column(db.Float, nullable=False, default=0.0)
    eligible_years = db.Column(db.String(100), nullable=False)  # comma-separated grad years

    package_lpa = db.Column(db.Float, nullable=True)
    location = db.Column(db.String(120), nullable=True)

    application_deadline = db.Column(db.Date, nullable=False)
    drive_date = db.Column(db.Date, nullable=True)

    status = db.Column(db.String(20), default=DriveStatus.PENDING, nullable=False)
    rejection_reason = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    applications = db.relationship(
        "Application", backref="drive", lazy="dynamic", cascade="all, delete-orphan"
    )

    # -- helpers -------------------------------------------------------
    def branch_list(self):
        return [b.strip() for b in self.eligible_branches.split(",") if b.strip()]

    def year_list(self):
        return [int(y.strip()) for y in self.eligible_years.split(",") if y.strip()]

    def is_open(self):
        return self.status == DriveStatus.APPROVED and self.application_deadline >= date.today()

    def is_eligible_for(self, student: "StudentProfile"):
        if student.branch not in self.branch_list():
            return False
        if student.graduation_year not in self.year_list():
            return False
        if student.cgpa < self.min_cgpa:
            return False
        return True

    def to_dict(self, include_company=True, applicant_count=None):
        data = {
            "id": self.id,
            "job_title": self.job_title,
            "job_description": self.job_description,
            "eligible_branches": self.branch_list(),
            "min_cgpa": self.min_cgpa,
            "eligible_years": self.year_list(),
            "package_lpa": self.package_lpa,
            "location": self.location,
            "application_deadline": self.application_deadline.isoformat()
            if self.application_deadline
            else None,
            "drive_date": self.drive_date.isoformat() if self.drive_date else None,
            "status": self.status,
            "rejection_reason": self.rejection_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if applicant_count is not None:
            data["applicant_count"] = applicant_count
        if include_company and self.company:
            data["company_id"] = self.company.id
            data["company_name"] = self.company.company_name
        return data


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
class Application(db.Model):
    __tablename__ = "applications"
    __table_args__ = (
        db.UniqueConstraint("student_id", "drive_id", name="uq_student_drive_once"),
    )

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("student_profiles.id"), nullable=False)
    drive_id = db.Column(db.Integer, db.ForeignKey("placement_drives.id"), nullable=False)

    status = db.Column(db.String(30), default=ApplicationStatus.APPLIED, nullable=False)
    applied_on = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    interview_datetime = db.Column(db.DateTime, nullable=True)
    remarks = db.Column(db.String(400), nullable=True)

    offer_letter_path = db.Column(db.String(255), nullable=True)

    def to_dict(self, include_drive=True, include_student=False):
        data = {
            "id": self.id,
            "status": self.status,
            "applied_on": self.applied_on.isoformat() if self.applied_on else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "interview_datetime": self.interview_datetime.isoformat()
            if self.interview_datetime
            else None,
            "remarks": self.remarks,
            "has_offer_letter": bool(self.offer_letter_path),
        }
        if include_drive and self.drive:
            data["drive"] = self.drive.to_dict()
        if include_student and self.student:
            data["student"] = self.student.to_dict()
        return data


# ---------------------------------------------------------------------------
# In-app notifications (bell icon) - also written to by Celery background jobs
# ---------------------------------------------------------------------------
class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    message = db.Column(db.String(400), nullable=False)
    category = db.Column(db.String(40), default="info")  # info | success | warning | danger
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "message": self.message,
            "category": self.category,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Record of generated monthly reports (optional feature bookkeeping)
# ---------------------------------------------------------------------------
class MonthlyReport(db.Model):
    __tablename__ = "monthly_reports"

    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.Integer, nullable=False)
    year = db.Column(db.Integer, nullable=False)
    drives_conducted = db.Column(db.Integer, default=0)
    students_applied = db.Column(db.Integer, default=0)
    students_selected = db.Column(db.Integer, default=0)
    pdf_path = db.Column(db.String(255), nullable=True)
    html_snapshot = db.Column(db.Text, nullable=True)
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("month", "year", name="uq_report_month_year"),)

    def to_dict(self):
        return {
            "id": self.id,
            "month": self.month,
            "year": self.year,
            "drives_conducted": self.drives_conducted,
            "students_applied": self.students_applied,
            "students_selected": self.students_selected,
            "pdf_path": self.pdf_path,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }
