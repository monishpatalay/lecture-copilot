from lecture_worker.stages.chapters import clean_chapters

STARTS = [0, 65.1, 130.5, 201.0]


def test_keeps_valid_chapters_in_time_order():
    raw = [{"t_s": 130.5, "title": " Chaining "}, {"t_s": 0, "title": "Introduction"}]
    assert clean_chapters(raw, STARTS) == [{"t_s": 0.0, "title": "Introduction"}, {"t_s": 130.5, "title": "Chaining"}]


def test_drops_anything_malformed_or_not_at_a_segment_start():
    raw = [
        {"t_s": 70, "title": "Not a segment start"},
        {"t_s": "65.1", "title": "Time as text"},
        {"t_s": 65.1, "title": "   "},
        {"t_s": 65.1},
        {"t_s": True, "title": "Boolean time"},
        "just a string",
        {"t_s": 201.0, "title": "x" * 200},
        {"t_s": 201.0, "title": "Second title for the same time"},
    ]
    assert clean_chapters(raw, STARTS) == [{"t_s": 201.0, "title": "x" * 60}]


def test_a_reply_that_is_not_a_list_gives_no_chapters():
    assert clean_chapters(None, STARTS) == []
    assert clean_chapters({"t_s": 0, "title": "x"}, STARTS) == []
