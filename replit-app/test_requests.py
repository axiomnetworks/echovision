import importlib.util
import unittest
from decimal import Decimal
spec=importlib.util.spec_from_file_location('builders','meta_requests.py')
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
class RequestTests(unittest.TestCase):
    def test_model(self):
        p=r.segment_image(b'\x89PNG\r\n\x1a\n','person')
        self.assertEqual('sam-3.1',p['model']); self.assertFalse(p['stream'])
        self.assertTrue(p['input'][0]['content'][1]['image_url'].startswith('data:image/png;base64,'))
    def test_standard(self): self.assertNotIn('contributor',r.REASONING_MODEL)
    def test_empty(self):
        with self.assertRaises(ValueError):r.segment_image(b'','person')
    def test_bad_type(self):
        with self.assertRaises(ValueError):r.segment_image(b'not an image','person')
    def test_blank_concept(self):
        with self.assertRaises(ValueError):r.segment_image(b'\xff\xd8\xff',' ')
    def test_big(self):
        with self.assertRaises(ValueError):r.segment_image(b'x'*1000001,'person')
    def test_cost(self): self.assertEqual(Decimal('0.025'),r.image_cost(10))
    def test_budget(self):
        b=r.TestBudget(1); b.reserve_image()
        with self.assertRaises(ValueError):b.reserve_image()
if __name__=='__main__':unittest.main()
