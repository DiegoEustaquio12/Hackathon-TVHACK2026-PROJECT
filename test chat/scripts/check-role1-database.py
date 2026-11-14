"""Transactional database acceptance checks; never sends WhatsApp messages.

Local by default. Hosted execution requires the explicit allowlisted project ref.
Reuses the SQL assertions without changing the local-only check files or runner.
All fixtures are rolled back, including when an assertion fails.
"""
import argparse
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT_REF = 'hfcetxrktdorebepttof'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--remote-ref', choices=[PROJECT_REF])
args = parser.parse_args()
cli = ROOT / 'node_modules' / '.bin' / ('supabase.cmd' if sys.platform == 'win32' else 'supabase')
checks = [
    'whatsapp-sales.sql',
    'onboarding-and-prices.sql',
    'standard-products-accounting.sql',
    'role2-storage.sql',
]
# Synthetic numbers, unique per execution. They are never messaged.
phones = ['1999' + f'{secrets.randbelow(10**10):010d}' for _ in range(9)]
if len(set(phones)) != len(phones):
    sys.exit('Fixture number collision; rerun the check.')
phone_list = ','.join("'" + phone + "'" for phone in phones)
sql = """do $acceptance$
declare t record; r text;
begin
 begin
  perform set_config('lock_timeout','5s',true);
  if exists(select 1 from public.businesses where whatsapp_id in (PHONE_LIST)) then
    raise exception 'Fixture identity already exists; aborting without changes';
  end if;
""".replace('PHONE_LIST', phone_list)
for name in checks:
    check = (ROOT / 'supabase' / 'checks' / name).read_text()
    for index, phone in enumerate(phones, 1):
        check = check.replace(f'199999900{index:02d}', phone)
    sql += '\nexecute $check$\n' + check + '\n$check$;\n'
sql += """
  if exists(select 1 from pg_tables where schemaname='public' and not rowsecurity) then
    raise exception 'FAIL: public table without RLS';
  end if;
  for t in select p.oid, p.proname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r,t.oid,'execute') then
        raise exception 'FAIL: privileged function exposed: % to %',t.proname,r;
      end if;
    end loop;
  end loop;
  foreach r in array array['anon','authenticated'] loop
    for t in select tablename from pg_tables where schemaname='public'
      and tablename <> 'businesses'
    loop
      if has_table_privilege(r,format('public.%I',t.tablename),'insert,update,delete') then
        raise exception 'FAIL: direct write exposed: % to %',t.tablename,r;
      end if;
    end loop;
  end loop;
  if exists(select 1 from public.businesses where whatsapp_id in (PHONE_LIST)) then
    raise exception 'FAIL: SQL checks left fixtures behind';
  end if;
  raise exception using errcode='ZX999',message='Acceptance checks passed; rollback';
 exception when sqlstate 'ZX999' then null;
 end;
end $acceptance$;
""".replace('PHONE_LIST', phone_list)

with tempfile.TemporaryDirectory(prefix='microai-db-check-') as folder:
    path = Path(folder) / 'acceptance.sql'
    path.write_text(sql)
    command = [str(cli), 'db', 'query', '--file', str(path)]
    if args.remote_ref:
        command += [f'--remote={args.remote_ref}', '--yes']
    print('Checking ' + (args.remote_ref or 'local database') + ' with rollback-only fixtures.', flush=True)
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    print(result.stdout, end='')
    if result.stderr:
        print(result.stderr, end='', file=sys.stderr)
    if result.returncode == 0:
        print('PASS: sales, stock, replay, shortage, tenant isolation, RLS, versioned prices, '
              'products, expenses, reports, leases, links and permissions; fixtures rolled back.')
    sys.exit(result.returncode)
