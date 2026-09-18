import functools
import http.server
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8734


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()


Handler = functools.partial(NoCacheHandler, directory=ROOT)
httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print(f"serving {ROOT} on port {PORT}")
httpd.serve_forever()
