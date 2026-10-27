import unittest,json
from watch_engine import track_summary,event_gate,analyze_clip,Unavailable
class Engine(unittest.TestCase):
 def test_tracks(self):
  t='<0f>3<|box;x1=1;y1=2;x2=3;y2=4;w=640;h=480;c=0.9|><|mask;x=0;y=0;data=1|>\n<1f>3<|box;x1=2;y1=2;x2=4;y2=4;w=640;h=480|><|mask;x=0;y=0;data=2|>'
  x=track_summary(t);self.assertEqual(len(x['tracks']['3']),2);self.assertEqual(x['visible_frames'],[0,1])
 def test_empty(self):self.assertEqual(track_summary('')['tracks'],{})
 def test_gate(self):
  x={'state':'candidate','evidence':'Cup moved right','event_key':'cup moved','confidence':.95}
  a=event_gate(x,{});self.assertFalse(a['confirmed']);self.assertTrue(event_gate(x,a)['confirmed'])
 def test_lost_clears(self):
  self.assertFalse(event_gate({'state':'lost_view','evidence':'No cup','confidence':.99},{'pending_key':'cup moved'})['confirmed'])
 def test_pipeline(self):
  calls=[]
  def fake(path,data,key):
   calls.append((path,data))
   if path.endswith('input_tokens'):return {'input_tokens':1000}
   text='<0f>1<|box;x1=1;y1=2;x2=3;y2=4;w=640;h=480|><|mask;x=0;y=0;data=1|>' if data['model']=='sam-3.1' else json.dumps({'state':'candidate','evidence':'Cup moved','event_key':'cup moved','confidence':.95})
   return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':text}]}]}
  x=analyze_clip(b'not a real clip','cup','cup moved','','fake',call=fake)
  self.assertEqual(x['state'],'candidate');self.assertEqual(len(calls),3)
  self.assertEqual(calls[0][1]['model'],'sam-3.1');self.assertFalse(calls[0][1]['store']);self.assertFalse(calls[2][1]['store'])
  self.assertEqual(calls[2][1]['max_output_tokens'],4000)
 def test_token_limit(self):
  def fake(p,d,k):return {'input_tokens':10001} if p.endswith('input_tokens') else {'status':'completed','output':[]}
  with self.assertRaises(Unavailable):analyze_clip(b'a','cup','moved','','fake',fake)
 def test_incomplete(self):
  def fake(p,d,k):return {'status':'incomplete','output':[]}
  with self.assertRaises(Unavailable):analyze_clip(b'a','cup','moved','','fake',fake)
if __name__=='__main__':unittest.main()
