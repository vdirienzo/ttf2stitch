"""Tests for the cell-center sampling module."""

from PIL import Image

from ttf2stitch.sampler import sample_bitmap, trim_bitmap


class TestSampleBitmap:
    def test_checkerboard_alternating(self, checkerboard_image):
        """A 4x4 checkerboard should produce alternating 1/0 cells."""
        bbox = (0, 0, 200, 200)
        bitmap = sample_bitmap(checkerboard_image, bbox, 4, 4)
        assert len(bitmap) == 4
        assert all(len(row) == 4 for row in bitmap)
        # (0,0) is black => '1', (0,1) is white => '0'
        assert bitmap[0][0] == "1"
        assert bitmap[0][1] == "0"
        assert bitmap[1][0] == "0"
        assert bitmap[1][1] == "1"

    def test_all_white_returns_all_zeros(self):
        img = Image.new("L", (100, 100), 255)
        bbox = (0, 0, 100, 100)
        bitmap = sample_bitmap(img, bbox, 2, 2)
        assert bitmap == ["00", "00"]

    def test_all_black_returns_all_ones(self):
        img = Image.new("L", (100, 100), 0)
        bbox = (0, 0, 100, 100)
        bitmap = sample_bitmap(img, bbox, 2, 2)
        assert bitmap == ["11", "11"]

    def test_single_cell(self):
        img = Image.new("L", (50, 50), 0)
        bbox = (0, 0, 50, 50)
        bitmap = sample_bitmap(img, bbox, 1, 1)
        assert bitmap == ["1"]

    def test_fill_threshold_just_above(self):
        """With a threshold of 0.5, a half-filled cell should be '0' (<=0.5 not >0.5)."""
        # Create an image that is exactly half dark (top half black, bottom half white)
        img = Image.new("L", (100, 100), 255)
        for y in range(50):
            for x in range(100):
                img.putpixel((x, y), 0)
        bbox = (0, 0, 100, 100)
        # With threshold=0.5, the fill ratio is ~0.5, which is NOT > 0.5
        bitmap = sample_bitmap(img, bbox, 1, 1, fill_threshold=0.5)
        assert bitmap == ["0"]

    def test_fill_threshold_just_below(self):
        """With a very low threshold and full-cell sampling, partial fill registers."""
        # Mostly white with some black in center area
        img = Image.new("L", (100, 100), 255)
        for y in range(40, 60):
            for x in range(40, 60):
                img.putpixel((x, y), 0)
        bbox = (0, 0, 100, 100)
        # sample_pct=1.0 samples the entire cell; threshold=0.01 is very low
        bitmap = sample_bitmap(img, bbox, 1, 1, sample_pct=1.0, fill_threshold=0.01)
        assert bitmap == ["1"]

    def test_respects_bbox_offset(self):
        """Only the region inside bbox should be sampled."""
        # Create a large white image with a black square at (50,50)-(100,100)
        img = Image.new("L", (200, 200), 255)
        for y in range(50, 100):
            for x in range(50, 100):
                img.putpixel((x, y), 0)
        # Sample only the black region
        bbox = (50, 50, 100, 100)
        bitmap = sample_bitmap(img, bbox, 1, 1)
        assert bitmap == ["1"]
        # Sample only the white region
        bbox_white = (0, 0, 50, 50)
        bitmap_white = sample_bitmap(img, bbox_white, 1, 1)
        assert bitmap_white == ["0"]


class TestTrimBitmap:
    def test_trims_empty_rows_and_cols(self):
        bitmap = [
            "0000",
            "0110",
            "0100",
            "0000",
        ]
        result = trim_bitmap(bitmap)
        assert result == ["11", "10"]

    def test_already_trimmed(self):
        bitmap = ["10", "01"]
        result = trim_bitmap(bitmap)
        assert result == ["10", "01"]

    def test_empty_input(self):
        result = trim_bitmap([])
        assert result == []

    def test_all_zeros_returns_empty(self):
        bitmap = ["000", "000"]
        result = trim_bitmap(bitmap)
        assert result == []

    def test_single_pixel(self):
        bitmap = [
            "000",
            "010",
            "000",
        ]
        result = trim_bitmap(bitmap)
        assert result == ["1"]

    def test_full_bitmap_no_trim(self):
        bitmap = ["111", "111", "111"]
        result = trim_bitmap(bitmap)
        assert result == ["111", "111", "111"]
