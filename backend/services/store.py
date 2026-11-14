"""SQLite persistence for a single-user local workspace."""
import json
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[2] / 'data' / 'proofmatch.sqlite'

def connect():
    DB.parent.mkdir(exist_ok=True)
    connection = sqlite3.connect(str(DB))
    connection.execute('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
    return connection

def read():
    with connect() as connection:
        row = connection.execute('SELECT body FROM workspace WHERE id=1').fetchone()
        return json.loads(row[0]) if row else None

def write(body):
    with connect() as connection:
        connection.execute('INSERT OR REPLACE INTO workspace VALUES (1, ?)', (json.dumps(body),))
