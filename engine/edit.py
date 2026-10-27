#!/usr/bin/env python3
"""Experimental FFmpeg video assembly; processes local files, not a web service."""
import argparse, json, pathlib, re, subprocess, tempfile

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

def probe(path):
    return json.loads(run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type','-of','json',str(path)]).stdout)

def intervals(path, duration):
    p = subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','silencedetect=noise=-35dB:d=0.8','-f','null','-'],capture_output=True,text=True,check=True)
    events = [(float(t), typ) for typ,t in re.findall(r'silence_(start|end):\s*([\d.]+)',p.stderr)]
    silence=[]; start=None
    for t,typ in events:
        if typ=='start': start=t
        elif start is not None:
            silence.append((start,t)); start=None
    if start is not None: silence.append((start,duration))
    # Keep 200 ms of each pause on either side of speech.
    keep=[]; pos=0.0
    for a,b in silence:
        a=max(pos,a+0.2); b=min(duration,b-0.2)
        if b<=a: continue
        if a-pos>0.03: keep.append((pos,a))
        pos=b
    if duration-pos>0.03: keep.append((pos,duration))
    return keep

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('clips',nargs='+'); ap.add_argument('-o','--output',required=True); ap.add_argument('--remove-silence',action='store_true'); ap.add_argument('--music'); args=ap.parse_args()
    output=pathlib.Path(args.output).resolve()
    inputs=[pathlib.Path(p).resolve() for p in args.clips]
    if output in inputs: ap.error('Output must differ from input files')
    with tempfile.TemporaryDirectory() as tmp:
        parts=[]
        for i,path in enumerate(inputs):
            meta=probe(path); duration=float(meta['format']['duration']); audio=any(s['codec_type']=='audio' for s in meta['streams'])
            if not any(s['codec_type']=='video' for s in meta['streams']): raise ValueError(f'No video: {path}')
            # A silent or music-only video remains intact: absence of speech is not evidence to discard it.
            keep=intervals(path,duration) if args.remove_silence and audio else [(0,duration)]
            if not keep: keep=[(0,duration)]
            for j,(start,end) in enumerate(keep):
                dest=pathlib.Path(tmp)/f'{i:04d}-{j:04d}.mp4'
                cmd=['ffmpeg','-y','-v','error','-ss',str(start),'-i',str(path)]
                if not audio: cmd+=['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000']
                cmd+=['-t',str(end-start),'-map','0:v:0','-map','0:a:0' if audio else '1:a:0','-vf','scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',str(dest)]
                run(cmd); parts.append(dest)
        manifest=pathlib.Path(tmp)/'list.txt'; manifest.write_text(''.join(f"file '{p}'\n" for p in parts))
        assembled=pathlib.Path(tmp)/'assembled.mp4'
        run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(manifest),'-c','copy','-movflags','+faststart',str(assembled)])
        if args.music:
            run(['ffmpeg','-y','-v','error','-i',str(assembled),'-stream_loop','-1','-i',args.music,'-filter_complex','[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-movflags','+faststart',str(output)])
        else:
            import shutil; shutil.copyfile(assembled,output)
    print(output)
if __name__=='__main__': main()
