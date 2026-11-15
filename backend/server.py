"""Run with: python3 -m backend.server. Local development server with account-isolated workspaces."""
import json
import os
import mimetypes
import time
import threading
from http.cookies import SimpleCookie
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[1]
# Minimal .env loader avoids a runtime dependency and never exposes secrets to JS.
if (ROOT / '.env').exists():
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
            
from backend.services import ai, jobs, store, documents, auth

# Basic per-IP throttling for password endpoints. Production deployments should
# also use an ingress-level limiter and verified email/password recovery flows.
AUTH_ATTEMPTS = {}
AUTH_LOCK = threading.Lock()
PAID_FIELDS = {'versions': [], 'rewrite': None, 'tasks': [], 'reviews': {}}
# Explicit web asset types avoid OS/Windows Registry overrides that block modules.
ASSET_TYPES = {'.js': 'application/javascript; charset=utf-8',
               '.mjs': 'application/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8',
               '.html': 'text/html; charset=utf-8'}

class Handler(BaseHTTPRequestHandler):
    def session_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return cookie['proofmatch_session'].value if 'proofmatch_session' in cookie else ''
        except Exception:
            return ''

    def user(self):
        return auth.current_user(self.session_token())

    def set_session(self, token):
        self.session_cookie = 'proofmatch_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + str(auth.SESSION_SECONDS if token else 0)
        if os.environ.get('COOKIE_SECURE') == '1':
            self.session_cookie += '; Secure'

    def check_auth_rate(self):
        address = self.client_address[0]
        now = time.monotonic()
        with AUTH_LOCK:
            recent = [t for t in AUTH_ATTEMPTS.get(address, []) if now-t < 600]
            AUTH_ATTEMPTS[address] = recent
            if len(recent) >= 20:
                return False
            recent.append(now)
        return True

    def json_response(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        if getattr(self, 'session_cookie', None):
            self.send_header('Set-Cookie', self.session_cookie)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlparse(self.path)
        try:
            if route.path == '/api/config':
                return self.json_response({'aiConfigured': ai.configured(), 'jobsConfigured': bool(os.environ.get('GREENHOUSE_BOARD')), 'mode': 'live' if ai.configured() else 'demo'})
            if route.path == '/api/auth/me':
                return self.json_response({'user': self.user()})
            if route.path.startswith('/api/') and not self.user():
                return self.json_response({'error': 'Sign in to continue.'}, 401)
            if route.path == '/api/workspace':
                user = self.user()
                workspace = auth.read_workspace(user['id'])
                if workspace is not None and user['plan'] != 'pro':
                    workspace.update(PAID_FIELDS)
                return self.json_response({'workspace': workspace})
            if route.path == '/api/jobs':
                board = os.environ.get('GREENHOUSE_BOARD')
                if not board:
                    return self.json_response({'error': 'Set GREENHOUSE_BOARD in .env to search live company postings.'}, 503)
                return self.json_response({'jobs': jobs.search(board, parse_qs(route.query).get('q', [''])[0])})
            path = (ROOT / 'frontend' / (route.path.lstrip('/') or 'index.html')).resolve()
            if not path.is_relative_to(ROOT / 'frontend') or not path.is_file():
                return self.json_response({'error': 'Not found.'}, 404)
            self.send_response(200)
            self.send_header('Content-Type', ASSET_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(path.read_bytes())
        except Exception as error:
            self.json_response({'error': str(error)}, 502)

    def do_POST(self):
        # Reject cross-origin browser mutations; this app is intentionally local-only.
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            return self.json_response({'error': 'Cross-origin requests are not allowed.'}, 403)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if size > 12 * 1024 * 1024:
                return self.json_response({'error': 'Request is too large.'}, 413)
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError('Request body must be an object.')
            if self.path == '/api/auth/guest':
                existing_user = self.user()
                if existing_user:
                    return self.json_response({'user': existing_user})
                if not self.check_auth_rate():
                    return self.json_response({'error': 'Too many guest sessions. Try again later.'}, 429)
                token, guest = auth.create_guest()
                self.set_session(token)
                return self.json_response({'user': guest})
            if self.path in {'/api/auth/register', '/api/auth/login'}:
                if not self.check_auth_rate():
                    return self.json_response({'error': 'Too many attempts. Try again in 10 minutes.'}, 429)
                token, user = (auth.register if self.path.endswith('register') else auth.login)(payload)
                self.set_session(token)
                return self.json_response({'user': user})
            user = self.user()
            if not user:
                return self.json_response({'error': 'Sign in to continue.'}, 401)
            if self.path == '/api/auth/logout':
                auth.logout(self.session_token())
                self.set_session('')
                return self.json_response({'signedOut': True})
            if self.path == '/api/billing/demo-checkout':
                auth.activate_demo(user['id'], payload)
                return self.json_response({'user': self.user(), 'message': 'Demo Pro activated. No payment was taken.'})
            if self.path in {'/api/ai/rewrite', '/api/ai/train', '/api/ai/feedback'} and user['plan'] != 'pro':
                return self.json_response({'error': 'ProofMatch Pro is required for Résumé and Training Studios.', 'upgradeRequired': True}, 403)
            if self.path == '/api/workspace':
                if not isinstance(payload, dict):
                    raise ValueError('Workspace must be an object.')
                if user['plan'] != 'pro':
                    previous = auth.read_workspace(user['id']) or {}
                    for field, default in PAID_FIELDS.items():
                        payload[field] = previous.get(field, default)
                auth.write_workspace(user['id'], payload)
                return self.json_response({'saved': True})
            if self.path == '/api/import':
                return self.json_response({'text': documents.extract(payload)})
            if self.path.startswith('/api/ai/'):
                if not ai.configured():
                    return self.json_response({'error': 'Add AI_API_KEY to .env to enable AI. Demo interactions are labeled in the interface.'}, 503)
                return self.json_response(ai.generate(self.path.rsplit('/', 1)[-1], payload))
            self.json_response({'error': 'Not found.'}, 404)
        except ValueError as error:
            self.json_response({'error': str(error)}, 400)
        except Exception as error:
            self.json_response({'error': 'Request failed: ' + str(error)}, 502)

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', 8000))), Handler)
    print('ProofMatch running at http://localhost:' + str(server.server_port), flush=True)
    server.serve_forever()
