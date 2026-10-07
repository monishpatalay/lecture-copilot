from lecture_worker.stages.transcribe import merge_pieces


def test_later_pieces_are_shifted_by_where_they_start():
    first = [{"start": 0.0, "end": 4.2, "text": " Welcome. "}, {"start": 595.0, "end": 600.03, "text": "So"}]
    second = [{"start": 0.5, "end": 3.0, "text": "a hash table"}, {"start": 3.0, "end": 3.4, "text": "   "}]
    assert merge_pieces([(0.0, first), (600.03, second)]) == [
        {"start": 0.0, "end": 4.2, "text": "Welcome."},
        {"start": 595.0, "end": 600.03, "text": "So"},
        {"start": 600.53, "end": 603.03, "text": "a hash table"},  # blank segment dropped
    ]


def test_a_retry_only_transcribes_the_pieces_that_were_not_saved():
    from lecture_worker.stages.transcribe import transcribe_pieces
    import pytest

    saved: dict[str, list] = {}
    calls: list[str] = []

    def transcribe(name):
        calls.append(name)
        if name == "002.mp3" and len(calls) == 3:
            raise RuntimeError("hourly limit")
        return [{"start": 0, "end": 1, "text": name}]

    names = ["000.mp3", "001.mp3", "002.mp3"]
    with pytest.raises(RuntimeError):
        transcribe_pieces(names, saved.get, saved.__setitem__, transcribe)
    assert sorted(saved) == ["000.mp3", "001.mp3"]  # kept from the failed run

    result = transcribe_pieces(names, saved.get, saved.__setitem__, transcribe)
    assert calls == ["000.mp3", "001.mp3", "002.mp3", "002.mp3"]  # the retry asked only for the missing piece
    assert [r[0]["text"] for r in result] == names
