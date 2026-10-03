from run_eval import best_threshold, first_hit_rank, mean_reciprocal_rank, overlaps, percentile, pick_subset, recall_at

QUESTION = {"question": "What is the load factor?", "lecture_no": 4, "gold_start_s": 100, "gold_end_s": 130, "covered": True}


def seg(lecture, start, end):
    return {"lecture_number": lecture, "start_s": start, "end_s": end}


def test_a_segment_counts_only_in_the_gold_lecture_and_when_it_shares_time_with_the_gold_span():
    assert overlaps(seg(4, 60, 101), QUESTION)       # ends one second into the span
    assert overlaps(seg(4, 129, 200), QUESTION)      # starts one second before it ends
    assert not overlaps(seg(4, 40, 100), QUESTION)   # ends exactly where the span starts
    assert not overlaps(seg(4, 130, 190), QUESTION)  # starts exactly where it ends
    assert not overlaps(seg(5, 100, 130), QUESTION)  # right time, wrong lecture


def test_rank_is_the_position_of_the_first_segment_holding_the_answer():
    assert first_hit_rank([seg(5, 100, 130), seg(4, 0, 60), seg(4, 90, 150), seg(4, 120, 180)], QUESTION) == 3
    assert first_hit_rank([seg(4, 0, 60)], QUESTION) is None
    assert first_hit_rank([], QUESTION) is None


def test_recall_and_mrr_treat_a_miss_as_zero():
    ranks = [1, 3, None, 6]
    assert recall_at(ranks, 1) == 0.25
    assert recall_at(ranks, 3) == 0.5
    assert recall_at(ranks, 6) == 0.75
    assert mean_reciprocal_rank(ranks) == (1 + 1 / 3 + 0 + 1 / 6) / 4


def test_percentile_uses_the_nearest_rank():
    values = [5.0, 1.0, 3.0, 2.0, 4.0]
    assert percentile(values, 50) == 3.0
    assert percentile(values, 95) == 5.0
    assert percentile([7.0], 95) == 7.0


def test_subset_is_stable_and_ignores_input_order():
    questions = [{"question": f"question {i}"} for i in range(20)]
    first = pick_subset(questions, 5)
    assert first == pick_subset(list(reversed(questions)), 5)
    assert len(first) == 5


def test_gate_sits_just_below_the_weakest_covered_question():
    threshold, blocked = best_threshold(covered=[0.80, 0.86, 0.91], uncovered=[0.70, 0.74, 0.79, 0.85])
    assert threshold == 0.795
    assert blocked == 0.75  # 0.85 still passes: the answer model has to refuse that one
