from reranker import apply_order, folds, parse_ranking


def test_ranking_parse_matches_the_app_and_falls_back_to_search_order():
    assert parse_ranking("Sure: [3, 1, 3, 99, 2]", 12) == [2, 0, 1]  # repeats and out-of-range dropped, 0-based
    assert parse_ranking("no list here", 12) is None
    segs = list("abcdefghijkl")
    assert apply_order(segs, [4, 2]) == ["e", "c", "a", "b", "d", "f"]  # picks first, the rest in search order
    assert apply_order(segs, None) == list("abcdef")


def test_a_held_out_lecture_never_appears_in_training():
    eval_qs = [{"question": f"e{n}", "lecture_no": n} for n in (3, 4, 5)]
    synth_qs = [{"question": f"s{n}", "lecture_no": n} for n in (3, 4, 5)]
    for lecture, train, test in folds(eval_qs, synth_qs):
        assert {q["lecture_no"] for q in train} == {3, 4, 5} - {lecture}
        assert [q["lecture_no"] for q in test] == [lecture]
