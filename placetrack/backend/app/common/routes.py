from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import Notification

common_bp = Blueprint("common", __name__)

BRANCHES = [
    "Computer Science",
    "Information Technology",
    "Electronics & Communication",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Data Science",
]


@common_bp.get("/branches")
def branches():
    return jsonify(branches=BRANCHES)


@common_bp.get("/notifications")
@jwt_required()
def list_notifications():
    user_id = int(get_jwt_identity())
    items = (
        Notification.query.filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify(notifications=[n.to_dict() for n in items], unread_count=unread_count)


@common_bp.post("/notifications/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    user_id = int(get_jwt_identity())
    note = Notification.query.filter_by(id=notification_id, user_id=user_id).first_or_404()
    note.is_read = True
    db.session.commit()
    return jsonify(notification=note.to_dict())


@common_bp.post("/notifications/read-all")
@jwt_required()
def mark_all_read():
    user_id = int(get_jwt_identity())
    Notification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify(status="ok")
