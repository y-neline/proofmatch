"""Regression coverage for translated quotes, PDF line breaks and partial output."""
import unittest
from backend.services.resume import resolve_analysis

class ResumeTests(unittest.TestCase):
    def test_model_quote_is_replaced_with_exact_source(self):
        source='Project A\nBuilt a Vue\ninterface.\nEducation'
        result=resolve_analysis({'experiences':[{'title':'Project A','description':'Built a Vue interface.','sourceQuote':'A paraphrased quotation','sourceLineIds':[1,2,3]}]},source)
        self.assertEqual(result['experiences'][0]['sourceQuote'],'Project A\nBuilt a Vue\ninterface.')
        self.assertIn(result['experiences'][0]['sourceQuote'],source)
        self.assertFalse(result['experiences'][0]['confirmed'])

    def test_invalid_entry_does_not_discard_valid_entries(self):
        result=resolve_analysis({'experiences':[{'description':'A project','sourceLineIds':[1]}, {'title':'Unsupported','description':'Invented','sourceLineIds':[99]}]},'Project source')
        self.assertEqual(len(result['experiences']),1)
        self.assertEqual(len(result['reviewEntries']),1)
        self.assertEqual(result['experiences'][0]['title'],'Imported experience')
        self.assertEqual(len(result['rawAnalysis']['experiences']),2)

    def test_exact_quote_still_supported(self):
        result=resolve_analysis({'experiences':[{'title':'Test','description':'Exact source','sourceQuote':'Exact source'}]},'Exact source')
        self.assertEqual(len(result['experiences']),1)

    def test_rejects_fake_quote_and_boolean_line_id(self):
        result=resolve_analysis({'experiences':[{'title':'Test','description':'Fake','sourceQuote':'Fake','sourceLineIds':[True]}]},'Real source')
        self.assertFalse(result['experiences'])
        self.assertEqual(len(result['reviewEntries']),1)
