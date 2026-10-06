from lecture_worker.stages.transcribe import merge_pieces


def test_later_pieces_are_shifted_by_where_they_start():
    first = [{"start": 0.0, "end": 4.2, "text": " Welcome. "}, {"start": 595.0, "end": 600.03, "text": "So"}]
    second = [{"start": 0.5, "end": 3.0, "text": "a hash table"}, {"start": 3.0, "end": 3.4, "text": "   "}]
    assert merge_pieces([(0.0, first), (600.03, second)]) == [
        {"start": 0.0, "end": 4.2, "text": "Welcome."},
        {"start": 595.0, "end": 600.03, "text": "So"},
        {"start": 600.53, "end": 603.03, "text": "a hash table"},  # blank segment dropped
    ]
