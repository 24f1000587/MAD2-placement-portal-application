import re
from datetime import date, datetime

from email_validator import validate_email, EmailNotValidError

PASSWORD_MIN_LEN = 8
_ROLL_RE = re.compile(r"^[A-Za-z0-9\-\/]{3,40}$")


class ValidationError(Exception):
    """Raised for a single, user-facing validation failure."""

    def __init__(self, field, message):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


def require_fields(payload: dict, fields: list):
    missing = [f for f in fields if not str(payload.get(f, "")).strip()]
    if missing:
        raise ValidationError(missing[0], f"'{missing[0]}' is required.")


def clean_email(raw_email: str) -> str:
    try:
        result = validate_email(raw_email, check_deliverability=False)
        return result.normalized.lower()
    except EmailNotValidError as exc:
        raise ValidationError("email", str(exc)) from exc


def validate_password(raw_password: str) -> None:
    if len(raw_password) < PASSWORD_MIN_LEN:
        raise ValidationError("password", f"Password must be at least {PASSWORD_MIN_LEN} characters.")
    if not re.search(r"[A-Za-z]", raw_password) or not re.search(r"\d", raw_password):
        raise ValidationError("password", "Password must contain both letters and numbers.")


def validate_roll_number(roll_number: str) -> None:
    if not _ROLL_RE.match(roll_number or ""):
        raise ValidationError("roll_number", "Roll number looks invalid.")


def validate_cgpa(value) -> float:
    try:
        cgpa = float(value)
    except (TypeError, ValueError):
        raise ValidationError("cgpa", "CGPA must be a number.")
    if not (0 <= cgpa <= 10):
        raise ValidationError("cgpa", "CGPA must be between 0 and 10.")
    return cgpa


def validate_year(value, field="graduation_year") -> int:
    try:
        year = int(value)
    except (TypeError, ValueError):
        raise ValidationError(field, "Year must be a whole number.")
    if year < 2000 or year > 2100:
        raise ValidationError(field, "Year looks out of range.")
    return year


def parse_date(value, field="date") -> date:
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValidationError(field, "Expected a date in YYYY-MM-DD format.")


def validate_future_date(value, field="date") -> date:
    d = parse_date(value, field)
    if d < date.today():
        raise ValidationError(field, "Date cannot be in the past.")
    return d
