"""Run the opt-in local integration test without printing service credentials."""
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[1]
suffix = '.cmd' if os.name == 'nt' else ''
cli = str(root / 'node_modules' / '.bin' / ('supabase' + suffix))
runner = str(root / 'node_modules' / '.bin' / ('vitest' + suffix))
status = subprocess.run([cli, 'status', '--output', 'json'], cwd=root, capture_output=True, text=True)
if status.returncode:
    sys.exit('Start local Supabase before running this check.')
try:
    config = json.loads(status.stdout)
    url = config['API_URL']
    key = config.get('SERVICE_ROLE_KEY') or config.get('SECRET_KEY')
    if urlparse(url).hostname not in ('127.0.0.1', 'localhost') or not key:
        raise ValueError()
except (KeyError, ValueError, TypeError):
    sys.exit('A local Supabase URL and server key are required.')
env = os.environ.copy()
env.update(RUN_LOCAL_SUPABASE_TESTS='true', ROLE2_LOCAL_URL=url, ROLE2_LOCAL_SERVICE_KEY=key)
sys.exit(subprocess.run([runner, 'run', 'tests/role2-local.integration.test.ts'], cwd=root, env=env).returncode)
