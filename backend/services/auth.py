"""Password hashing, revocable sessions, and clearly simulated subscriptions."""
import calendar
import datetime
import hashlib
import hmac
import re
import secrets
import sqlite3
import time
from backend.services import store

SESSION_SECONDS = 60 * 60 * 24 * 30
PASSWORD_ROUNDS = 600000


def initialize(connection):
    connection.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, pro_until INTEGER NOT NULL DEFAULT 0)')
    connection.execute('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)')
    connection.execute('CREATE TABLE IF NOT EXISTS user_workspaces (user_id INTEGER PRIMARY KEY, body TEXT NOT NULL)')


def connection():
    db = store.connect()
    initialize(db)
    return db


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), PASSWORD_ROUNDS).hex()


def public_user(row):
    active = row[3] > int(time.time())
    return {'id': row[0], 'email': row[1], 'name': row[2], 'plan': 'pro' if active else 'free',
            'proUntil': row[3] if active else None, 'billingMode': 'demo',
            'guest': row[1].startswith('guest-') and row[1].endswith('@proofmatch.invalid')}


def register(payload, *, migrate_legacy=True):
    email = str(payload.get('email', '')).strip().lower()
    name = str(payload.get('name', '')).strip()
    password = payload.get('password', '')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254:
        raise ValueError('Enter a valid email address.')
    if not name or len(name) > 100:
        raise ValueError('Enter your name (up to 100 characters).')
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise ValueError('Use a password between 8 and 128 characters.')
    salt = secrets.token_hex(16)
    hashed = hash_password(password, salt)
    with connection() as db:
        try:
            cursor = db.execute('INSERT INTO users (email,name,password_hash,salt) VALUES (?,?,?,?)', (email, name, hashed, salt))
        except sqlite3.IntegrityError:
            raise ValueError('An account with this email already exists. Sign in instead.')
        user_id = cursor.lastrowid
        # Preserve the old local workspace only for the first account on this device.
        if migrate_legacy and db.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 1:
            old = db.execute('SELECT body FROM workspace WHERE id=1').fetchone()
            if old:
                db.execute('INSERT INTO user_workspaces VALUES (?,?)', (user_id, old[0]))
    return new_session(user_id)


def create_guest():
    """Create an isolated, temporary demo account without shared credentials.

    Guest accounts deliberately cannot be recovered by email/password, and never
    inherit data from the legacy single-user workspace.
    """
    return register({
        'name': 'Guest',
        'email': 'guest-' + secrets.token_hex(16) + '@proofmatch.invalid',
        'password': secrets.token_urlsafe(32),
    }, migrate_legacy=False)


def login(payload):
    email = str(payload.get('email', '')).strip().lower()
    password = payload.get('password', '')
    if not isinstance(password, str) or len(password) > 128:
        raise ValueError('Email or password is incorrect.')
    with connection() as db:
        row = db.execute('SELECT id,password_hash,salt FROM users WHERE email=?', (email,)).fetchone()
    # Do the same expensive operation for unknown email addresses.
    candidate = hash_password(password, row[2] if row else '00' * 16)
    if not row or not hmac.compare_digest(candidate, row[1]):
        raise ValueError('Email or password is incorrect.')
    return new_session(row[0])


def new_session(user_id):
    token = secrets.token_urlsafe(32)
    with connection() as db:
        db.execute('DELETE FROM sessions WHERE expires<=?', (int(time.time()),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + SESSION_SECONDS))
    return token, current_user(token)


def current_user(token):
    if not token:
        return None
    with connection() as db:
        row = db.execute('SELECT u.id,u.email,u.name,u.pro_until FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
                         (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
        return public_user(row) if row else None


def logout(token):
    with connection() as db:
        db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))


def activate_demo(user_id, payload):
    # Card fields never belong in an API request or database, even in a demo.
    if set(payload) != {'email'}:
        raise ValueError('Demo checkout accepts only a billing email. Do not send card details.')
    email = str(payload['email']).strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ValueError('Enter a valid billing email.')
    now = datetime.datetime.now(datetime.timezone.utc)
    year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    expires = int(now.replace(year=year, month=month, day=min(now.day, calendar.monthrange(year, month)[1])).timestamp())
    with connection() as db:
        row = db.execute('SELECT pro_until FROM users WHERE id=?', (user_id,)).fetchone()
        # Repeated clicks do not stack simulated months.
        if row[0] <= int(time.time()):
            db.execute('UPDATE users SET pro_until=? WHERE id=?', (expires, user_id))


def read_workspace(user_id):
    import json
    with connection() as db:
        row = db.execute('SELECT body FROM user_workspaces WHERE user_id=?', (user_id,)).fetchone()
        return json.loads(row[0]) if row else None


def write_workspace(user_id, body):
    import json
    with connection() as db:
        db.execute('INSERT OR REPLACE INTO user_workspaces VALUES (?,?)', (user_id, json.dumps(body)))
