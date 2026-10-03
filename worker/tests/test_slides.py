import imagehash
from PIL import Image, ImageDraw

from lecture_worker.stages.slides import drop_near_duplicates, parse_showinfo


def test_parse_showinfo_reads_timestamps_in_order():
    stderr = (
        "[Parsed_showinfo_1 @ 0x1] n:   0 pts:      0 pts_time:0       duration: 1\n"
        "[Parsed_showinfo_1 @ 0x1] n:   1 pts: 123456 pts_time:41.152  duration: 1\n"
        "frame=    2 fps=0.0 q=4.0 size=N/A time=00:00:41.15\n"
    )
    assert parse_showinfo(stderr) == [0.0, 41.152]


def _slide(boxes: list[tuple[int, int, int, int]]) -> imagehash.ImageHash:
    img = Image.new("RGB", (320, 180), "white")
    draw = ImageDraw.Draw(img)
    for box in boxes:
        draw.rectangle(box, fill="black")
    return imagehash.phash(img)


def test_drop_near_duplicates_keeps_first_of_each_run_and_repeats():
    a = _slide([(20, 20, 150, 60)])
    a_again = _slide([(20, 20, 151, 60)])  # one pixel different
    b = _slide([(200, 100, 300, 170), (10, 120, 90, 170)])
    assert drop_near_duplicates([a, a_again, b, b, a]) == [0, 2, 4]
