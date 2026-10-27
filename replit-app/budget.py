"""Transactional cross-process allowance. No raw media or user descriptions stored."""
import os
from datetime import datetime, timezone
class BudgetError(Exception):pass

def reserve():
    import psycopg
    grant=os.environ.get('ECHO_ALLOWANCE_ID',''); expiry=os.environ.get('ECHO_EXPIRES_AT','')
    limit=int(os.environ.get('ECHO_MAX_CLIPS','0'))
    if not grant or not expiry or not 0<limit<=10:raise BudgetError('No approved allowance is active.')
    try: end=datetime.fromisoformat(expiry)
    except ValueError:raise BudgetError('Allowance expiry is invalid.')
    if end.tzinfo is None or datetime.now(timezone.utc)>=end:raise BudgetError('The approved allowance has expired.')
    # Create once; never reset an allowance on restart or by changing its limit.
    with psycopg.connect(os.environ['DATABASE_URL'],connect_timeout=5) as db:
        db.execute('CREATE TABLE IF NOT EXISTS echo_allowance (id TEXT PRIMARY KEY, used INTEGER NOT NULL, cap INTEGER NOT NULL)')
        db.execute('INSERT INTO echo_allowance(id,used,cap) VALUES(%s,0,%s) ON CONFLICT DO NOTHING',(grant,limit))
        row=db.execute('UPDATE echo_allowance SET used=used+1 WHERE id=%s AND cap=%s AND used<cap RETURNING cap-used',(grant,limit)).fetchone()
        if row is None:raise BudgetError('The approved clip allowance is exhausted or changed. Nothing sent.')
        return row[0]
