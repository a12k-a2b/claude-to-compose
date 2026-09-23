import tempfile
import unittest
from pathlib import Path

from import_da63_vectors import ICONS, OUTPUT, emit, parse_file


class Da63VectorImportTest(unittest.TestCase):
    def test_captured_bundle_round_trips_to_checked_in_native_data(self):
        source = Path(__file__).resolve().parents[3] / "note-overlay-retrofit-pilot/design-da63/assets/vectors"
        self.assertEqual(11, len(ICONS))
        self.assertTrue(source.is_dir(), f"captured SVG bundle missing: {source}")
        self.assertEqual(OUTPUT.read_text(), emit(source))

    def test_transform_order_and_inherited_stroke_are_recorded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.svg"
            path.write_text('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
                            '<path d="M0 0 L1 1" transform="matrix(1 0 0 1 2 3) matrix(0 -1 1 0 4 5)"/></svg>')
            view_box, parts = parse_file(path)
            self.assertEqual(24, view_box)
            self.assertFalse(parts[0]["fill"])
            self.assertTrue(parts[0]["stroke"])
            self.assertEqual(1.8, parts[0]["stroke_width"])
            self.assertEqual([[1, 0, 0, 1, 2, 3], [0, -1, 1, 0, 4, 5]], parts[0]["matrices"])

    def test_unsupported_color_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.svg"
            path.write_text('<svg viewBox="0 0 24 24"><path d="M0 0" fill="#ff0000"/></svg>')
            with self.assertRaisesRegex(ValueError, "unsupported color"):
                parse_file(path)

    def test_unhandled_visual_attributes_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.svg"
            path.write_text('<svg viewBox="0 0 24 24" opacity="0.5"><path d="M0 0"/></svg>')
            with self.assertRaisesRegex(ValueError, "unsupported svg attributes: opacity"):
                parse_file(path)
            path.write_text('<svg viewBox="0 0 24 24"><path d="M0 0" clip-path="url(#mask)"/></svg>')
            with self.assertRaisesRegex(ValueError, "unsupported path attributes: clip-path"):
                parse_file(path)


if __name__ == "__main__":
    unittest.main()
