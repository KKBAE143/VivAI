from api.tasks import ORDER_STEP, compute_sort_order


def test_sparse_task_order_positions_and_exhausted_gap_signal():
    assert compute_sort_order(None, None) == ORDER_STEP
    assert compute_sort_order(1_000, None) == 2_000
    assert compute_sort_order(None, 2_000) == 1_000
    assert compute_sort_order(1_000, 3_000) == 2_000
    assert compute_sort_order(1_000, 1_001) == 1_000
