#!/usr/bin/env python3
"""Local-only experimental server. Not suitable for public deployment."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from tempfile import TemporaryDirectory
import json, subprocess, sys

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 200 * 1024 * 1024
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/': self.send_error(404); return
        data=(ROOT/'index.html').read_text().replace('</body>', '<script>' + (ROOT/'engine/test-ui.js').read_text() + '</script></body>').encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        if self.path != '/api/edit': self.send_error(404); return
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<=0 or n>MAX_BYTES: self.send_error(413, 'Maximum total upload is 200 MB'); return
            ctype=self.headers.get('Content-Type','')
            if not ctype.startswith('multipart/form-data;'): self.send_error(415); return
            raw=self.rfile.read(n)
            msg=BytesParser(policy=default).parsebytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
            with TemporaryDirectory() as td:
                files=[]; trim=False
                for part in msg.iter_parts():
                    name=part.get_param('name',header='content-disposition')
                    if name=='clips' and part.get_filename():
                        dest=Path(td)/f'input-{len(files)}'; dest.write_bytes(part.get_payload(decode=True)); files.append(dest)
                    elif name=='silence': trim=part.get_content().strip()=='on'
                if not files or len(files)>20: self.send_error(400, 'Choose 1 to 20 clips'); return
                out=Path(td)/'output.mp4'
                cmd=[sys.executable,str(ROOT/'engine/edit.py'),*[str(x) for x in files],'-o',str(out)]
                if trim: cmd.append('--remove-silence')
                subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=600)
                data=out.read_bytes(); self.send_response(200); self.send_header('Content-Type','video/mp4'); self.send_header('Content-Disposition','attachment; filename="teacher-video.mp4"'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        except (ValueError, subprocess.SubprocessError, OSError): self.send_error(500,'Could not process video')

if __name__=='__main__':
    print('Local test server: http://127.0.0.1:8765',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
