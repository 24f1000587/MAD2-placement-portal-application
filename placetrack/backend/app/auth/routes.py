from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from app.extensions import db
from app.models import User, StudentProfile, CompanyProfile, Role, ApprovalStatus
from app.utils.validators import (
    ValidationError,
    require_fields,
    clean_email,
    validate_password,
    validate_roll_number,
    validate_cgpa,
    validate_year,
)


auth_bp = Blueprint("auth", __name__)


def _issue_token(user: User):
    extra_claims = {"role": user.role, "name": user.name, "email": user.email}
    token = create_access_token(identity=str(user.id), additional_claims=extra_claims)
    return token


@auth_bp.post("/register/student")
def register_student():
    payload = request.get_json(silent=True) or {}
    try:
        require_fields(
            payload,
            ["name", "email", "password", "roll_number", "branch", "graduation_year", "cgpa"],
        )
        email = clean_email(payload["email"])
        validate_password(payload["password"])
        validate_roll_number(payload["roll_number"])
        cgpa = validate_cgpa(payload["cgpa"])
        grad_year = validate_year(payload["graduation_year"])
    except ValidationError as exc:
        return jsonify(error=exc.message, field=exc.field), 400

    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with this email already exists."), 409
    if StudentProfile.query.filter_by(roll_number=payload["roll_number"]).first():
        return jsonify(error="This roll number is already registered."), 409

    user = User(name=payload["name"].strip(), email=email, role=Role.STUDENT)
    user.set_password(payload["password"])
    db.session.add(user)
    db.session.flush()  # get user.id before commit

    profile = StudentProfile(
        user_id=user.id,
        roll_number=payload["roll_number"].strip(),
        branch=payload["branch"].strip(),
        graduation_year=grad_year,
        cgpa=cgpa,
        phone=payload.get("phone", "").strip() or None,
        skills=payload.get("skills", "").strip() or None,
    )
    db.session.add(profile)
    db.session.commit()

    token = _issue_token(user)
    return jsonify(token=token, user=user.to_dict(), profile=profile.to_dict(include_user=False)), 201


@auth_bp.post("/register/company")
def register_company():
    payload = request.get_json(silent=True) or {}
    try:
        require_fields(
            payload,
            [
                "hr_contact_name",
                "email",
                "password",
                "company_name",
                "hr_contact_email",
            ],
        )
        email = clean_email(payload["email"])
        hr_email = clean_email(payload["hr_contact_email"])
        validate_password(payload["password"])
    except ValidationError as exc:
        return jsonify(error=exc.message, field=exc.field), 400

    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with this email already exists."), 409

    user = User(name=payload["hr_contact_name"].strip(), email=email, role=Role.COMPANY)
    user.set_password(payload["password"])
    db.session.add(user)
    db.session.flush()

    profile = CompanyProfile(
        user_id=user.id,
        company_name=payload["company_name"].strip(),
        hr_contact_name=payload["hr_contact_name"].strip(),
        hr_contact_email=hr_email,
        hr_phone=payload.get("hr_phone", "").strip() or None,
        website=payload.get("website", "").strip() or None,
        industry=payload.get("industry", "").strip() or None,
        description=payload.get("description", "").strip() or None,
        approval_status=ApprovalStatus.PENDING,
    )
    db.session.add(profile)
    db.session.commit()

    token = _issue_token(user)
    return (
        jsonify(
            token=token,
            user=user.to_dict(),
            profile=profile.to_dict(include_user=False),
            notice="Registration successful. Your company profile is pending admin approval before you can post drives.",
        ),
        201,
    )


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    try:
        require_fields(payload, ["email", "password"])
        email = clean_email(payload["email"])
    except ValidationError as exc:
        return jsonify(error=exc.message, field=exc.field), 400

    user = User.query.filter_by(email=email).first()
    if user is None or not user.check_password(payload["password"]):
        return jsonify(error="Invalid email or password."), 401

    if not user.is_active:
        return jsonify(error="This account has been deactivated by the placement cell."), 403
    if user.is_blacklisted:
        reason = f" Reason: {user.blacklist_reason}" if user.blacklist_reason else ""
        return jsonify(error=f"This account has been blacklisted.{reason}"), 403

    token = _issue_token(user)
    extra = {}
    if user.role == Role.STUDENT and user.student_profile:
        extra["profile"] = user.student_profile.to_dict(include_user=False)
    elif user.role == Role.COMPANY and user.company_profile:
        extra["profile"] = user.company_profile.to_dict(include_user=False)

    return jsonify(token=token, user=user.to_dict(), **extra), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.get_or_404(int(get_jwt_identity()))
    extra = {}
    if user.role == Role.STUDENT and user.student_profile:
        extra["profile"] = user.student_profile.to_dict(include_user=False)
    elif user.role == Role.COMPANY and user.company_profile:
        extra["profile"] = user.company_profile.to_dict(include_user=False)
    return jsonify(user=user.to_dict(), **extra), 200
