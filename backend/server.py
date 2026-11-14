"""Run with: python3 -m backend.server. Local single-user development server."""
import json
import os
import mimetypes
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from backend.services import ai, jobs, store, documents

ROOT = Path(__file__).resolve().parents[1]
# Minimal .env loader avoids a runtime dependency and never exposes secrets to JS.
if (ROOT / '.env').exists():
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('\"\''))

class Handler(BaseHTTPRequestHandler):
    def json_response(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlparse(self.path)
        try:
            if route.path == '/api/config':
                return self.json_response({'aiConfigured': ai.configured(), 'jobsConfigured': bool(os.environ.get('GREENHOUSE_BOARD')), 'mode': 'live' if ai.configured() else 'demo'})
            if route.path == '/api/workspace':
                return self.json_response({'workspace': store.read()})
            if route.path == '/api/jobs':
                board = os.environ.get('GREENHOUSE_BOARD')
                if not board:
                    return self.json_response({'error': 'Set GREENHOUSE_BOARD in .env to search live company postings.'}, 503)
                return self.json_response({'jobs': jobs.search(board, parse_qs(route.query).get('q', [''])[0])})
            path = (ROOT / 'frontend' / (route.path.lstrip('/') or 'index.html')).resolve()
            if not path.is_relative_to(ROOT / 'frontend') or not path.is_file():
                return self.json_response({'error': 'Not found.'}, 404)
            self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
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
            if self.path == '/api/workspace':
                if not isinstance(payload, dict):
                    raise ValueError('Workspace must be an object.')
                store.write(payload)
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
    server = ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', 8000))), Handler)
    print('ProofMatch running at http://localhost:' + str(server.server_port), flush=True)
    server.serve_forever()
