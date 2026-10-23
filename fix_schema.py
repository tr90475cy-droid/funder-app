# fix_schema.py — one-off migration for SQLite. Safe to re-run.
import os, sqlite3, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app  # noqa: E402

uri = app.config['SQLALCHEMY_DATABASE_URI']
if not uri.startswith('sqlite:///'):
    print(f'Not SQLite ({uri}) — this script is SQLite-only'); sys.exit(1)

path = uri.replace('sqlite:///', '')
if not os.path.isabs(path):
    # relative URIs resolve against the app's instance folder in Flask 2.x+
    for base in (app.instance_path, os.getcwd()):
        cand = os.path.join(base, path)
        if os.path.exists(cand):
            path = cand; break

if not os.path.exists(path):
    print(f'DB not found: {path}'); sys.exit(1)
print(f'Database: {path}\n')

NEW_COLUMNS = [
    ('users', 'whatsapp_number',        'VARCHAR(20)'),
    ('users', 'bio',                    'VARCHAR(200)'),
    ('users', 'subaccount_code',        'VARCHAR(50)'),
    ('users', 'paystack_recipient_code','VARCHAR(50)'),
]

conn = sqlite3.connect(path)
cur  = conn.cursor()

def has_table(t):
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,))
    return cur.fetchone() is not None

def has_col(t, c):
    cur.execute(f'PRAGMA table_info("{t}")')
    return any(r[1] == c for r in cur.fetchall())

# 1. Add missing columns
for table, col, typ in NEW_COLUMNS:
    if not has_table(table):
        print(f'· skip {table}.{col} (table missing)');  continue
    if has_col(table, col):
        print(f'· {table}.{col} already exists');        continue
    cur.execute(f'ALTER TABLE "{table}" ADD COLUMN "{col}" {typ}')
    print(f'✓ added {table}.{col}')

# 2. Promote matric_no index to UNIQUE (safely — check dupes first)
if has_table('student_verifications'):
    cur.execute(
        'SELECT matric_no, COUNT(*) FROM student_verifications '
        'WHERE matric_no IS NOT NULL GROUP BY matric_no HAVING COUNT(*) > 1'
    )
    dupes = cur.fetchall()
    if dupes:
        print('\n⚠ Duplicate matric_no rows — unique index NOT applied:')
        for m, n in dupes:
            print(f'    {m!r}: {n} rows')
        print('  Clean these up manually, then re-run this script.')
    else:
        cur.executescript(
            'DROP INDEX IF EXISTS ix_student_verifications_matric_no;\n'
            'CREATE UNIQUE INDEX ix_student_verifications_matric_no '
            '  ON student_verifications(matric_no);'
        )
        print('✓ unique index on student_verifications.matric_no')

    # 3. Composite index for the admin dashboard query
    cur.execute(
        'CREATE INDEX IF NOT EXISTS ix_sv_status_submitted '
        '  ON student_verifications(status, submitted_at)'
    )
    print('✓ ix_sv_status_submitted')

conn.commit()

# 4. Verify
print('\nusers table columns now:')
cur.execute('PRAGMA table_info(users)')
for r in cur.fetchall():
    print(f'  {r[1]:30s} {r[2]:15s} notnull={r[3]}')

conn.close()
print('\nDone — restart app.py.')