from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('drive_upload_release', Path(__file__).with_name('drive_upload_release.py'))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class State:
    def __init__(self, payload: bytes):
        self.expected = payload
        self.data = bytearray()
        self.drop_first_response = True
        self.finalized = False
        self.upload_requests = 0


class Handler(BaseHTTPRequestHandler):
    state: State

    def log_message(self, *_args):
        pass

    def _range(self) -> str:
        return f'bytes=0-{len(self.state.data) - 1}' if self.state.data else ''

    def do_PUT(self):
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length)
        command = self.headers.get('X-Goog-Upload-Command', '')
        if command == 'query':
            if self.state.finalized:
                self._final()
            else:
                self.send_response(308)
                self.send_header('X-Goog-Upload-Status', 'active')
                if self._range():
                    self.send_header('Range', self._range())
                self.send_header('Content-Length', '0')
                self.end_headers()
            return
        offset = int(self.headers.get('X-Goog-Upload-Offset', '-1'))
        if offset != len(self.state.data) or int(self.headers.get('X-Goog-Upload-Total-Size', '-1')) != len(self.state.expected):
            self.send_response(400)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        self.state.upload_requests += 1
        self.state.data.extend(body)
        last = 'finalize' in command
        if self.state.drop_first_response and not last:
            # Baytları kabul et ama yanıtı kaybet; istemci query ile devam etmeli.
            self.state.drop_first_response = False
            self.close_connection = True
            return
        if last:
            if bytes(self.state.data) != self.state.expected:
                self.send_response(400)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            self.state.finalized = True
            self._final()
            return
        self.send_response(308)
        self.send_header('X-Goog-Upload-Status', 'active')
        self.send_header('Range', self._range())
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _final(self):
        body = json.dumps({
            'id': 'drive-file-1',
            'name': 'sample.bin',
            'size': str(len(self.state.data)),
            'md5Hash': base64.b64encode(hashlib.md5(self.state.expected, usedforsecurity=False).digest()).decode('ascii'),
        }).encode('utf-8')
        self.send_response(200)
        self.send_header('X-Goog-Upload-Status', 'final')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class DriveUploadTest(unittest.TestCase):
    def test_lost_response_resumes_without_duplicate_bytes_and_verifies_md5(self):
        payload = bytes(range(256)) * 2300 + b'son-parca'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sample.bin'
            path.write_bytes(payload)
            Handler.state = State(payload)
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                result = MODULE.upload(path, f'http://127.0.0.1:{server.server_port}/private-session', 256 * 1024)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
            self.assertEqual(result['id'], 'drive-file-1')
            self.assertEqual(result['bytes'], len(payload))
            self.assertTrue(result['md5Verified'])
            self.assertEqual(bytes(Handler.state.data), payload)
            self.assertGreaterEqual(Handler.state.upload_requests, 3)
            self.assertNotIn('private-session', json.dumps(result))

    def test_chunk_must_be_multiple_of_256_kib(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sample.bin'
            path.write_bytes(b'x')
            with self.assertRaises(MODULE.UploadError):
                MODULE.upload(path, 'http://127.0.0.1/unused', 1000)


if __name__ == '__main__':
    unittest.main()
