import json, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def command(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)
def duration(path):
    return float(json.loads(command('ffprobe','-v','error','-show_entries','format=duration','-of','json',str(path)).stdout)['format']['duration'])
class EngineTest(unittest.TestCase):
    def test_join_silence_and_music(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d); a=d/'speech.mp4'; b=d/'silent.mp4'; music=d/'music.wav'; out=d/'result.mp4'
            command('ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=25:d=4','-f','lavfi','-i',r'aevalsrc=if(lt(t\,1)+gt(t\,3)\,0.3*sin(2*PI*440*t)\,0):s=48000:d=4','-shortest','-c:v','libx264','-c:a','aac',str(a))
            command('ffmpeg','-v','error','-f','lavfi','-i','color=c=red:s=90x160:r=25:d=1','-c:v','libx264',str(b))
            command('ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=220:duration=1',str(music))
            command(sys.executable,str(ROOT/'engine/edit.py'),str(a),str(b),'-o',str(out),'--remove-silence','--music',str(music))
            self.assertGreater(duration(out),3.0); self.assertLess(duration(out),3.8)
            streams=json.loads(command('ffprobe','-v','error','-show_entries','stream=codec_type','-of','json',str(out)).stdout)['streams']
            self.assertEqual({x['codec_type'] for x in streams},{'video','audio'})
if __name__=='__main__': unittest.main()
