import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
import edit, subtitles

class SubtitleTest(unittest.TestCase):
    def test_missing_key_fails_before_network_or_audio(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaisesRegex(RuntimeError,'OPENAI_API_KEY'):
                subtitles.transcribe('unused','unused.srt')

    def test_multiplexes_timed_thai_subtitle_after_edit(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'source.mp4'; output=root/'output.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=blue:s=160x90:r=25:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-shortest','-c:v','libx264','-c:a','aac',str(source)],check=True)
            def fake_transcribe(video,srt):
                self.assertTrue(Path(video).exists())
                Path(srt).write_text('1\n00:00:00,000 --> 00:00:00,800\nสวัสดีคุณครู\n',encoding='utf-8')
            with patch.object(edit,'transcribe',side_effect=fake_transcribe), patch.object(sys,'argv',['edit.py',str(source),'-o',str(output),'--auto-subtitles','--format','square']):
                edit.main()
            result=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type:stream_tags=language','-of','json',str(output)],check=True,capture_output=True,text=True)
            streams=json.loads(result.stdout)['streams']
            self.assertTrue(any(s['codec_type']=='subtitle' and s.get('tags',{}).get('language')=='tha' for s in streams))

if __name__=='__main__': unittest.main()
