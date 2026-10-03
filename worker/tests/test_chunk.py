from lecture_worker.stages.chunk import chunk_transcript


def seg(start, end, text):
    return {"start": start, "end": end, "text": text}


def test_windows_are_60_to_90s_and_break_at_sentence_ends():
    # 10 s segments; only every third one ends a sentence.
    transcript = [seg(i * 10, i * 10 + 10, "end." if i % 3 == 2 else "mid") for i in range(18)]
    chunks = chunk_transcript(transcript, [])
    assert [(c["start_s"], c["end_s"]) for c in chunks] == [(0, 60), (60, 120), (120, 180)]
    assert all(c["transcript"].endswith("end.") for c in chunks)


def test_hard_break_at_90s_when_no_sentence_end():
    transcript = [seg(i * 10, i * 10 + 10, "no stop") for i in range(12)]
    chunks = chunk_transcript(transcript, [])
    assert [(c["start_s"], c["end_s"]) for c in chunks] == [(0, 90), (90, 120)]


def test_attaches_slides_on_screen_during_window():
    transcript = [seg(0, 70, "First."), seg(70, 140, "Second.")]
    slides = [{"t_s": 0, "text": "Intro"}, {"t_s": 50, "text": "Chaining"}, {"t_s": 100, "text": "Doubling"}]
    chunks = chunk_transcript(transcript, slides)
    assert chunks[0]["slide_text"] == "Intro\n\nChaining"
    assert chunks[1]["slide_text"] == "Chaining\n\nDoubling"  # Chaining was still up at 70 s
