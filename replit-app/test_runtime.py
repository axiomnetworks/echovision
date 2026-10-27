import unittest,subprocess,os,tempfile
from pathlib import Path
from watch_engine import normalize_clip
class Runtime(unittest.TestCase):
 def test_transcode(self):
  import imageio_ffmpeg
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'generated.mp4'
   subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-f','lavfi','-i','color=c=blue:s=320x240:r=10','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-y',str(p)],check=True)
   data=normalize_clip(p.read_bytes());self.assertIn(b'ftyp',data[:32])
 def test_invalid(self):
  from watch_engine import Unavailable
  with self.assertRaises(Unavailable):normalize_clip(b'not video'*30)
if __name__=='__main__':unittest.main()
