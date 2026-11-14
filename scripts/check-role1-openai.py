"""Explicit real OpenAI acceptance with user-reviewed local fixtures; no domain writes."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', required=True, type=Path)
parser.add_argument('--allow-upload', action='store_true', help='Explicitly allow sending fixture files to OpenAI (billable API).')
args = parser.parse_args()
if not args.allow_upload:
    sys.exit('No upload performed. Add --allow-upload only for fixtures you authorize sending to OpenAI.')
if not os.environ.get('OPENAI_API_KEY'):
    sys.exit('No upload performed. Configure OPENAI_API_KEY in your local environment; never paste it into chat.')
if not args.manifest.is_file():
    sys.exit('No upload performed. A local fixture manifest file is required.')
root = Path(__file__).resolve().parents[1]
runner = root / 'node_modules' / '.bin' / ('vitest.cmd' if os.name == 'nt' else 'vitest')
env = os.environ.copy()
env.update(RUN_OPENAI_ACCEPTANCE='true', ROLE1_OPENAI_FIXTURE_MANIFEST=str(args.manifest.resolve()))
sys.exit(subprocess.run([str(runner), 'run', 'tests/role1-openai.acceptance.test.ts'], cwd=root, env=env).returncode)
