from lecture_worker.stages.transcode import progress_at, seconds_encoded


def test_reads_how_far_ffmpeg_has_got_and_ignores_other_lines():
    assert seconds_encoded("out_time_us=90500000\n") == 90.5
    assert seconds_encoded("out_time_us=N/A\n") is None
    assert seconds_encoded("frame=1200\n") is None
    assert seconds_encoded("out_time_us=-33000\n") == 0  # ffmpeg can report a small negative start


def test_progress_runs_from_60_to_85_over_the_video():
    assert [progress_at(s, 100) for s in (0, 50, 100, 140)] == [60, 72, 85, 85]
    assert progress_at(30, 0) == 60  # unknown length: stay put, never divide by zero


def probe(**changes):
    video = {"codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p", "height": 720, "field_order": "progressive"}
    audio = {"codec_type": "audio", "codec_name": "aac"}
    container = {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "bit_rate": "900000"}
    for key, value in changes.items():
        if key == "audio_codec":
            audio["codec_name"] = value
        elif key in container:
            container[key] = value
        else:
            video[key] = value
    return {"streams": [video, audio], "format": container}


def test_a_web_ready_upload_is_copied_and_anything_else_is_re_encoded():
    from lecture_worker.stages.transcode import can_copy

    assert can_copy(probe())
    assert can_copy(probe(height=360))
    assert not can_copy(probe(height=1080))  # too large to stream as it is
    assert not can_copy(probe(codec_name="hevc"))  # not every browser plays it
    assert not can_copy(probe(pix_fmt="yuv420p10le"))  # 10-bit
    assert not can_copy(probe(audio_codec="opus"))
    assert not can_copy(probe(bit_rate="9000000"))  # a raw screen recording
    assert not can_copy(probe(bit_rate="N/A"))
    assert not can_copy(probe(format_name="matroska,webm"))
    assert not can_copy({"streams": [], "format": {}})
