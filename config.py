import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def env_or(key, default):
    """Return env var if set and non-empty, else default."""
    val = os.environ.get(key)
    return val if val else default


class Config:
    SECRET_KEY = env_or('SECRET_KEY', 'fundar-dev-secret-change-in-prod')

    db_url = env_or('DATABASE_URL', '')
    if db_url and db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)

    if db_url:
        SQLALCHEMY_DATABASE_URI = db_url
    else:
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASE_DIR, 'fundar.db')

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = env_or('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    MAX_CONTENT_LENGTH = 20 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}

    ADMIN_PATH = env_or('ADMIN_PATH', '/admin')
    ADMIN_KEY = env_or('ADMIN_KEY', 'fundar-admin-2026')
    ADMIN_SESSION_MINUTES = int(env_or('ADMIN_SESSION_MINUTES', '30'))