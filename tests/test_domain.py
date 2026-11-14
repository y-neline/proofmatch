"""HTTP regression coverage for authenticated workspaces and demo entitlements."""
import base64
import http.cookiejar
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from backend.server import Handler, AUTH_ATTEMPTS
from backend.services import store, documents, auth

class DocumentTests(unittest.TestCase):
    def test_original_text_is_preserved(self):
        source = 'Built Vue pages. No performance measurements.'
        self.assertEqual(documents.extract({'name':'resume.txt','content':base64.b64encode(source.encode()).decode()}), source)

    def test_unsupported_file_fails(self):
        with self.assertRaises(ValueError):
            documents.extract({'name':'image.png','content':'aGk='})

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.old_db = store.DB
        store.DB = Path(cls.tmp.name) / 'test.sqlite'
        cls.server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)
        cls.counter = 0

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        store.DB = cls.old_db
        cls.tmp.cleanup()

    def setUp(self):
        AUTH_ATTEMPTS.clear()
        self.client = self.new_client()
        type(self).counter += 1
        self.email = 'test%d@example.com' % self.counter
        self.call('/api/auth/register', {'name':'Test User','email':self.email,'password':'testing-password'})

    def new_client(self):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, path, body=None, client=None, headers=None):
        req = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), headers=headers or {'Content-Type':'application/json'})
        with (client or self.client).open(req) as response:
            return json.load(response)

    def test_workspace_roundtrip_and_account_isolation(self):
        data={'sourceText':'Private résumé','experiences':[{'title':'Private project'}]}
        self.call('/api/workspace',data)
        self.assertEqual(self.call('/api/workspace')['workspace']['sourceText'],'Private résumé')
        other=self.new_client()
        self.call('/api/auth/register',{'name':'Other','email':'other%d@example.com'%self.counter,'password':'different-password'},other)
        self.assertIsNone(self.call('/api/workspace',client=other)['workspace'])

    def test_guest_cannot_read_resume_or_call_ai(self):
        guest=self.new_client()
        for path, body in [('/api/workspace',None),('/api/ai/parse',{'sourceText':'Private'})]:
            with self.assertRaises(urllib.error.HTTPError) as caught:
                self.call(path,body,guest)
            self.assertEqual(caught.exception.code,401)

    def test_free_plan_cannot_call_paid_endpoints(self):
        for task in ['rewrite','train','feedback']:
            with self.assertRaises(urllib.error.HTTPError) as caught:
                self.call('/api/ai/'+task,{})
            self.assertEqual(caught.exception.code,403)

    def test_cannot_unlock_via_workspace_fields(self):
        self.call('/api/workspace',{'plan':'pro','versions':[{'text':'Forged'}],'tasks':[{'id':'fake'}]})
        self.assertEqual(self.call('/api/auth/me')['user']['plan'],'free')
        self.assertEqual(self.call('/api/workspace')['workspace']['versions'],[])

    def test_demo_checkout_and_relogin_preserve_pro(self):
        result=self.call('/api/billing/demo-checkout',{'email':self.email})
        self.assertEqual(result['user']['plan'],'pro')
        until=result['user']['proUntil']
        self.assertEqual(self.call('/api/billing/demo-checkout',{'email':self.email})['user']['proUntil'],until)
        self.call('/api/workspace',{'versions':[{'text':'Saved Pro version'}]})
        self.call('/api/auth/logout',{})
        self.assertIsNone(self.call('/api/auth/me')['user'])
        self.call('/api/auth/login',{'email':self.email,'password':'testing-password'})
        self.assertEqual(self.call('/api/auth/me')['user']['plan'],'pro')
        self.assertEqual(self.call('/api/workspace')['workspace']['versions'][0]['text'],'Saved Pro version')

    def test_checkout_rejects_card_data(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/billing/demo-checkout',{'email':self.email,'card':'4242424242424242'})
        self.assertEqual(caught.exception.code,400)
        self.assertEqual(self.call('/api/auth/me')['user']['plan'],'free')

    def test_expired_pro_preserves_but_hides_paid_data(self):
        self.call('/api/billing/demo-checkout',{'email':self.email})
        self.call('/api/workspace',{'versions':[{'text':'Keep this'}]})
        user=self.call('/api/auth/me')['user']
        with auth.connection() as db:
            db.execute('UPDATE users SET pro_until=0 WHERE id=?',(user['id'],))
        self.assertEqual(self.call('/api/workspace')['workspace']['versions'],[])
        self.call('/api/workspace',{'sourceText':'A free edit','versions':[]})
        self.assertEqual(auth.read_workspace(user['id'])['versions'][0]['text'],'Keep this')

    def test_passwords_are_hashed_and_login_checks_password(self):
        with auth.connection() as db:
            hashed,salt=db.execute('SELECT password_hash,salt FROM users WHERE email=?',(self.email,)).fetchone()
        self.assertNotEqual(hashed,'testing-password')
        self.assertEqual(len(salt),32)
        with self.assertRaises(urllib.error.HTTPError):
            self.call('/api/auth/login',{'email':self.email,'password':'wrong-password'})

    def test_config_has_no_secret(self):
        self.assertEqual(set(self.call('/api/config')),{'aiConfigured','jobsConfigured','mode'})

    def test_cross_origin_write_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/workspace',{},headers={'Origin':'https://example.org'})
        self.assertEqual(caught.exception.code,403)

    def test_javascript_mime_ignores_incorrect_os_mapping(self):
        with patch('backend.server.mimetypes.guess_type', return_value=('text/plain', None)):
            with self.client.open(self.base+'/js/app.js') as response:
                self.assertEqual(response.headers.get_content_type(),'application/javascript')

    def test_static_traversal_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/%2e%2e/.env')
        self.assertEqual(caught.exception.code,404)

    def test_session_cookie_is_httponly(self):
        guest=self.new_client()
        req=urllib.request.Request(self.base+'/api/auth/login',data=json.dumps({'email':self.email,'password':'testing-password'}).encode(),headers={'Content-Type':'application/json'})
        with guest.open(req) as response:
            cookie=response.headers['Set-Cookie']
        self.assertIn('HttpOnly',cookie)
        self.assertIn('SameSite=Lax',cookie)
        self.assertNotIn('password',cookie)

class MigrationTests(unittest.TestCase):
    def test_only_first_account_receives_legacy_workspace(self):
        old_db=store.DB
        with tempfile.TemporaryDirectory() as directory:
            try:
                store.DB=Path(directory)/'migration.sqlite'
                store.write({'sourceText':'Original local résumé'})
                _,first=auth.register({'name':'First','email':'first@example.com','password':'first-password'})
                _,second=auth.register({'name':'Second','email':'second@example.com','password':'second-password'})
                self.assertEqual(auth.read_workspace(first['id'])['sourceText'],'Original local résumé')
                self.assertIsNone(auth.read_workspace(second['id']))
            finally:
                store.DB=old_db

if __name__=='__main__':
    unittest.main()
