import os

from flask import Flask, send_from_directory, render_template
from dotenv import load_dotenv


load_dotenv()

from app.config import config_by_name, INSTANCE_DIR, FRONTEND_STATIC_DIR, FRONTEND_TEMPLATE_DIR
from app.extensions import db, jwt, cache, cors, migrate



def create_app(env_name=None):
    env_name = env_name or os.environ.get("FLASK_ENV", "development")
    config_cls = config_by_name.get(env_name, config_by_name["development"])

    os.makedirs(INSTANCE_DIR, exist_ok=True)

    
    app = Flask(
        __name__,
        static_folder=FRONTEND_STATIC_DIR,
        template_folder=FRONTEND_TEMPLATE_DIR,
        instance_path=INSTANCE_DIR,
    )
    app.config.from_object(config_cls)

    for path in (
        app.config["RESUME_UPLOAD_DIR"],
        app.config["CSV_EXPORT_DIR"],
        app.config["REPORT_DIR"],
        app.config["OFFER_LETTER_DIR"],
    ):
        os.makedirs(path, exist_ok=True)

    # -- extensions ------------------------------------------------------
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    try:
        cache.init_app(app)
    except Exception:
        # Redis not reachable (e.g. quick local preview without Redis running)
        # fall back to an in-memory cache so the app still boots for a demo.
        app.config["CACHE_TYPE"] = "SimpleCache"
        cache.init_app(app)

    # -- blueprints --------------------------------------------------------
    from app.auth.routes import auth_bp
    from app.admin.routes import admin_bp
    from app.company.routes import company_bp
    from app.student.routes import student_bp
    from app.common.routes import common_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(company_bp, url_prefix="/api/company")
    app.register_blueprint(student_bp, url_prefix="/api/student")
    app.register_blueprint(common_bp, url_prefix="/api/common")

    # -- celery (task registration + app-context binding) -------------------
    from app.celery_app import init_celery

    init_celery(app)

    # -- JWT error handlers (return clean JSON instead of HTML) ---------------
    @jwt.unauthorized_loader
    def _missing_token(reason):
        return {"error": "Authentication required.", "detail": reason}, 401

    @jwt.invalid_token_loader
    def _invalid_token(reason):
        return {"error": "Invalid session, please log in again.", "detail": reason}, 422

    @jwt.expired_token_loader
    def _expired_token(header, payload):
        return {"error": "Session expired, please log in again."}, 401

    # -- frontend entry point + static passthrough ---------------------------
    @app.route("/")
    @app.route("/<path:client_route>")
    def index(client_route=None):
        # Any non-/api route is handled client-side by the Vue router; Flask
        # just needs to always return the same SPA shell (Jinja2 is used
        # ONLY as the CDN entry point here, never to render UI markup).
        return render_template("index.html")

    @app.route("/healthz")
    def healthz():
        return {"status": "ok", "app": "PlaceTrack"}

    # -- create tables + seed admin on first boot -------------------------
    with app.app_context():
        db.create_all()
        from app.seed import seed_admin

        seed_admin()

    return app