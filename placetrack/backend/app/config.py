import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))  # backend/
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))  # placetrack/ (parent of backend/ and frontend/)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
FRONTEND_STATIC_DIR = os.path.join(FRONTEND_DIR, "static")
FRONTEND_TEMPLATE_DIR = os.path.join(FRONTEND_DIR, "templates")
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")


class Config:
    """Base configuration shared by every environment."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "placetrack-dev-secret-change-me")

    # --- Database -----------------------------------------------------
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(INSTANCE_DIR, 'placetrack.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"check_same_thread": False}}

    # --- Auth (JWT) -----------------------------------------------------
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "placetrack-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_TOKEN_LOCATION = ["headers"]

    # --- Redis / Cache ----------------------------------------------------
    CACHE_TYPE = os.environ.get("CACHE_TYPE", "RedisCache")
    CACHE_REDIS_URL = os.environ.get("CACHE_REDIS_URL", "redis://localhost:6379/1")
    CACHE_DEFAULT_TIMEOUT = 120

    # --- Celery -------------------------------------------------------
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/2")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/3")

    # --- Admin seed -----------------------------------------------------
    ADMIN_NAME = os.environ.get("ADMIN_NAME", "Placement Cell Admin")
    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@placetrack.edu")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@1234")

    # --- Notifications --------------------------------------------------
    GCHAT_WEBHOOK_URL = os.environ.get("GCHAT_WEBHOOK_URL", "")
    NOTIFICATION_LOG_PATH = os.path.join(INSTANCE_DIR, "notifications.log")

    MAIL_SERVER = os.environ.get("MAIL_SERVER", "")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "1") == "1"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "placetrack@institute.edu")

    # --- File storage -----------------------------------------------------
    # Runtime-generated files (resumes, CSV/PDF exports) are backend state,
    # not frontend assets, so they live under backend/instance/ - never
    # inside the frontend/ bundle.
    RESUME_UPLOAD_DIR = os.path.join(INSTANCE_DIR, "uploads", "resumes")
    CSV_EXPORT_DIR = os.path.join(INSTANCE_DIR, "exports", "csv")
    REPORT_DIR = os.path.join(INSTANCE_DIR, "exports", "reports")
    OFFER_LETTER_DIR = os.path.join(INSTANCE_DIR, "exports", "offer_letters")
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB uploads cap

    # --- Business rules ---------------------------------------------------
    ALLOWED_RESUME_EXTENSIONS = {"pdf", "doc", "docx"}
    APPLICATION_DEADLINE_REMINDER_DAYS = 2  # remind students N days before deadline


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CACHE_TYPE = "SimpleCache"


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
