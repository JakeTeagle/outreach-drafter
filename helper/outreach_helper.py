#!/usr/bin/env python3
"""Local relay for the Outreach Drafter extension.

Some Anthropic orgs (e.g. with custom data retention) block API calls made directly
from a browser (CORS), so the extension sends its request here and this forwards it. It only
listens on 127.0.0.1, only accepts calls from this extension, and stores no key:
the extension passes its own key with each request.
"""
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("OUTREACH_HELPER_PORT", "8787"))
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
FORWARD_HEADERS = ("x-api-key", "anthropic-version", "anthropic-beta", "content-type")


def allowed_origin(origin):
    return origin is None or origin.startswith("chrome-extension://")


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin")
        if origin and allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", ", ".join(FORWARD_HEADERS))
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _reply(self, status, body, content_type="application/json"):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not allowed_origin(self.headers.get("Origin")):
            return self._reply(403, b"{}")
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            return self._reply(200, b'{"ok": true}')
        self._reply(404, b"{}")

    def do_POST(self):
        if self.path != "/v1/messages" or not allowed_origin(self.headers.get("Origin")):
            return self._reply(403, json.dumps({"error": {"message": "Not allowed"}}).encode())

        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        headers = {h: self.headers[h] for h in FORWARD_HEADERS if self.headers.get(h)}
        req = urllib.request.Request(ANTHROPIC_URL, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                self._reply(res.status, res.read())
        except urllib.error.HTTPError as e:
            self._reply(e.code, e.read())
        except Exception as e:  # network down, timeout, etc.
            self._reply(502, json.dumps({"error": {"message": f"Helper could not reach Claude: {e}"}}).encode())

    def log_message(self, fmt, *args):
        pass  # keep candidate data out of logs


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
