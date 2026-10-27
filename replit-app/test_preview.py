import unittest
from pathlib import Path
class PreviewTests(unittest.TestCase):
    def test_local_only(self):
        source=Path('public/app.js').read_text()
        for call in ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'localStorage', 'sessionStorage']:
            self.assertNotIn(call,source)
        self.assertIn("visibilitychange",source)
        self.assertIn("getTracks().forEach(track=>track.stop())",source)
    def test_content_is_text(self):
        self.assertIn('document.createTextNode',Path('public/app.js').read_text())
        self.assertNotIn('innerHTML',Path('public/app.js').read_text())
    def test_disclosure(self):
        source=Path('public/index.html').read_text()
        self.assertIn('AI is not connected.',source)
        self.assertIn('aria-live="polite"',source)
        self.assertIn('for="target"',source)
