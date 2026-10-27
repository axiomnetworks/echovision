import unittest,subprocess,sys,time,urllib.request,urllib.error,json
class HTTP(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.proc=subprocess.Popen([sys.executable,'server.py'],env={'PATH':'/usr/bin:/bin','PORT':'3177'})
  for _ in range(30):
   try:urllib.request.urlopen('http://127.0.0.1:3177/api/status');break
   except OSError:time.sleep(.1)
 @classmethod
 def tearDownClass(cls):cls.proc.terminate();cls.proc.wait()
 def test_disabled(self):
  x=json.load(urllib.request.urlopen('http://127.0.0.1:3177/api/status'));self.assertFalse(x['enabled']);self.assertTrue(x['sample_only'])
 def test_paths(self):
  for p in ['/','/app.js','/style.css','/privacy.html']:self.assertEqual(urllib.request.urlopen('http://127.0.0.1:3177'+p).status,200)
  with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen('http://127.0.0.1:3177/../server.py')
 def test_no_cors(self):
  req=urllib.request.Request('http://127.0.0.1:3177/api/session',data=b'{}',headers={'Origin':'https://attacker.invalid','Content-Type':'application/json'})
  with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(req)
  self.assertEqual(e.exception.code,403)
 def test_disabled_post(self):
  req=urllib.request.Request('http://127.0.0.1:3177/api/session',data=b'{}',headers={'Origin':'http://127.0.0.1:3177','Content-Type':'application/json'})
  with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(req)
  self.assertEqual(e.exception.code,503)
if __name__=='__main__':unittest.main()
