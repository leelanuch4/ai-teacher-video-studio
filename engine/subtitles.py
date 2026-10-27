"""Create an SRT from speech in a completed video (experimental, server-side)."""
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MAX_AUDIO_BYTES = 24_000_000

def transcribe(video, srt_path):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise RuntimeError('Automatic captions require OPENAI_API_KEY on the server')
    with tempfile.TemporaryDirectory() as temp:
        audio = Path(temp) / 'speech.mp3'
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(video),'-vn','-ac','1','-ar','16000','-b:a','32k',str(audio)],check=True,capture_output=True)
        if audio.stat().st_size > MAX_AUDIO_BYTES:
            raise ValueError('Audio is too long for a single transcription request')
        boundary = '----teacherstudio' + secrets.token_hex(16)
        chunks = []
        def field(name, value):
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        field('model','whisper-1'); field('language','th'); field('response_format','srt')
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="speech.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode())
        chunks.append(audio.read_bytes()); chunks.append(f'\r\n--{boundary}--\r\n'.encode())
        request=Request('https://api.openai.com/v1/audio/transcriptions',data=b''.join(chunks),headers={'Authorization':'Bearer '+key,'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
        try:
            with urlopen(request, timeout=180) as response:
                text=response.read(2_000_000).decode('utf-8')
        except (HTTPError, URLError) as exc:
            raise RuntimeError('Speech transcription failed; check provider credentials and availability') from exc
        if '-->' not in text:
            raise ValueError('Transcription returned no timed captions')
        Path(srt_path).write_text(text,encoding='utf-8')
