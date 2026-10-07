from lecture_worker.stages.transcode import progress_at, seconds_encoded


def test_reads_how_far_ffmpeg_has_got_and_ignores_other_lines():
    assert seconds_encoded("out_time_us=90500000\n") == 90.5
    assert seconds_encoded("out_time_us=N/A\n") is None
    assert seconds_encoded("frame=1200\n") is None
    assert seconds_encoded("out_time_us=-33000\n") == 0  # ffmpeg can report a small negative start


def test_progress_runs_from_60_to_85_over_the_video():
    assert [progress_at(s, 100) for s in (0, 50, 100, 140)] == [60, 72, 85, 85]
    assert progress_at(30, 0) == 60  # unknown length: stay put, never divide by zero
