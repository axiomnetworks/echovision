import unittest
from pathlib import Path
class PreviewTests(unittest.TestCase):
 def test_private_transport(self):
  s=Path('public/app.js').read_text();self.assertNotIn('localStorage',s);self.assertNotIn('innerHTML',s)
  self.assertIn("visibilitychange",s);self.assertIn("getTracks().forEach(t=>t.stop())",s);self.assertIn("/api/clip",s)
 def test_disclosure(self):
  s=Path('public/index.html').read_text();self.assertIn('aria-live="polite"',s);self.assertIn('for="target"',s);self.assertIn('product improvement',s)
 def test_no_key(self):
  for p in Path('public').glob('*'):self.assertNotIn('LLM_',p.read_text())
