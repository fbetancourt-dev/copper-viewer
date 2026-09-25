import unittest
import os
import tempfile
from copper_viewer.parser import EagleParser
from copper_viewer.generator import build_viewer_html
from copper_viewer.svg_engine import EagleToSvg

class TestCopperViewer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.samples_dir = os.path.join(cls.base_dir, 'copper_viewer', 'samples')
        cls.uno_sch = os.path.join(cls.samples_dir, 'uno_rev3.sch')
        cls.uno_brd = os.path.join(cls.samples_dir, 'uno_rev3.brd')

    def test_parse_uno(self):
        self.assertTrue(os.path.exists(self.uno_sch), 'uno_rev3.sch must exist')
        self.assertTrue(os.path.exists(self.uno_brd), 'uno_rev3.brd must exist')
        
        parser = EagleParser(self.uno_sch, self.uno_brd)
        data = parser.parse()
        
        self.assertIn('board', data)
        self.assertIn('elements', data['board'])
        self.assertIn('signals', data['board'])
        self.assertIn('packages', data['board'])
        
        self.assertGreater(len(data['board']['elements']), 0)
        self.assertGreater(len(data['board']['signals']), 0)
        self.assertGreater(len(data['board']['packages']), 0)

    def test_generate_html_template(self):
        parser = EagleParser(self.uno_sch, self.uno_brd)
        data = parser.parse()
        html = build_viewer_html(data)
        
        self.assertIn('CopperSearch', html)
        self.assertIn('renderPartThumbnail', html)
        self.assertIn('renderSignalThumbnail', html)
        self.assertIn('thumb-container', html)
        self.assertIn('copper-micro-thumb', html)
        self.assertIn('THREE.WebGLRenderer', html)
        self.assertIn('ATMEGA328P', html)

    def test_svg_export(self):
        parser = EagleParser(self.uno_sch, self.uno_brd)
        data = parser.parse()
        exporter = EagleToSvg(data)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            sch_svg = os.path.join(tmpdir, 'sch.svg')
            brd_svg = os.path.join(tmpdir, 'brd.svg')
            exporter.export_schematic(sch_svg)
            exporter.export_board(brd_svg, side='both')
            
            self.assertTrue(os.path.exists(sch_svg))
            self.assertTrue(os.path.exists(brd_svg))
            self.assertGreater(os.path.getsize(sch_svg), 1000)
            self.assertGreater(os.path.getsize(brd_svg), 1000)

if __name__ == '__main__':
    unittest.main()
