from functools import wraps

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity

from app.models import User


def role_required(*allowed_roles):
    """Restrict an endpoint to one or more roles (admin/student/company).

    Also re-checks that the account is still active & not blacklisted on
    every request, so a blacklisted user's existing token stops working
    immediately rather than waiting for expiry.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role")
            if role not in allowed_roles:
                return jsonify(error="You do not have permission to access this resource."), 403

            user = User.query.get(int(get_jwt_identity()))
            if user is None or not user.can_login:
                return (
                    jsonify(error="This account has been deactivated or blacklisted."),
                    403,
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def company_must_be_approved(fn):
    """Guard used on top of role_required('company') for endpoints (like
    creating a drive) that require prior admin approval of the company."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        from app.models import CompanyProfile, ApprovalStatus

        user_id = int(get_jwt_identity())
        profile = CompanyProfile.query.filter_by(user_id=user_id).first()
        if profile is None or profile.approval_status != ApprovalStatus.APPROVED:
            return (
                jsonify(
                    error="Your company profile is not approved by the placement cell yet."
                ),
                403,
            )
        return fn(*args, **kwargs)

    return wrapper
