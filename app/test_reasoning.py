import unittest
import importlib.util
from decimal import Decimal
spec=importlib.util.spec_from_file_location('builders','meta_requests.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class ReasoningTests(unittest.TestCase):
    def test_proposal(self):
        p=r.reasoning_question('Does one snapshot prove someone left?')
        self.assertEqual(p['max_completion_tokens'],1024)
        self.assertEqual(p['reasoning_effort'],'low')
        self.assertNotIn('tools',p)
        self.assertEqual(p['model'],'muse-spark-1.3')
    def test_no_budget_silently_raised(self):
        with self.assertRaises(ValueError):r.reasoning_question('x',2048)
    def test_no_blank(self):
        with self.assertRaises(ValueError):r.reasoning_question('  ')
    def test_incomplete_never_answer(self):
        p={'choices':[{'finish_reason':'length','message':{'content':'No'}}]}
        self.assertEqual(r.classify_reasoning(p),{'state':'incomplete','answer':None})
    def test_empty_never_success(self):
        p={'choices':[{'finish_reason':'stop','message':{'content':''}}]}
        self.assertEqual(r.classify_reasoning(p)['state'],'unavailable')
    def test_complete(self):
        p={'choices':[{'finish_reason':'stop','message':{'content':' No. '}}]}
        self.assertEqual(r.classify_reasoning(p)['answer'],'No.')
    def test_missing(self):self.assertEqual(r.classify_reasoning({})['state'],'error')
    def test_bill_reasoning(self):
        self.assertEqual(r.reasoning_cost(47,128),Decimal('0.00060275'))
        self.assertEqual(r.reasoning_cost(1000,1024),Decimal('0.005602'))
