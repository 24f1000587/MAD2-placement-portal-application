"""
Creates the one-and-only Admin account programmatically after the database
schema is created. There is intentionally no admin registration endpoint —
this is the only way an admin account can ever come into existence, matching
the "Admin must pre-exist... [No admin registration allowed]" requirement.
"""
from flask import current_app

from app.extensions import db
from app.models import User, Role


def seed_admin():
    existing_admin = User.query.filter_by(role=Role.ADMIN).first()
    if existing_admin:
        return existing_admin

    admin = User(
        name=current_app.config["ADMIN_NAME"],
        email=current_app.config["ADMIN_EMAIL"].lower(),
        role=Role.ADMIN,
        is_active=True,
    )
    admin.set_password(current_app.config["ADMIN_PASSWORD"])
    db.session.add(admin)
    db.session.commit()
    current_app.logger.info(
        "Seeded admin account: %s (change ADMIN_PASSWORD in .env for real deployments)",
        admin.email,
    )
    return admin
