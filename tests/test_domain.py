"""Exercise evidence boundaries and local HTTP contracts without external APIs."""
import base64
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from backend.server import Handler
from backend.services import store, documents

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
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        store.DB = cls.old_db
        cls.tmp.cleanup()

    def test_workspace_snapshot_roundtrip(self):
        data={'versions':[{'text':'Original résumé','job':{'id':'123'},'plan':[]}],'sourceText':'Original'}
        req=urllib.request.Request(self.base+'/api/workspace',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
        urllib.request.urlopen(req).close()
        with urllib.request.urlopen(self.base+'/api/workspace') as response:
            self.assertEqual(json.load(response)['workspace'],data)

    def test_config_has_no_secret(self):
        with urllib.request.urlopen(self.base+'/api/config') as response:
            self.assertEqual(set(json.load(response)),{'aiConfigured','jobsConfigured','mode'})

    def test_static_traversal_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(self.base+'/%2e%2e/.env')
        self.assertEqual(caught.exception.code,404)

    def test_cross_origin_write_is_rejected(self):
        req=urllib.request.Request(self.base+'/api/workspace',data=b'{}',headers={'Origin':'https://example.org'})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(req)
        self.assertEqual(caught.exception.code,403)

if __name__=='__main__':
    unittest.main()
