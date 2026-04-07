"""
Merge Sort Demo
===============
A from-scratch implementation of the merge sort algorithm with detailed
commentary on every phase: divide, base-case, and merge/conquer.
"""


def merge_sort(array: list) -> list:
    """
    Recursively sort *array* using the merge sort algorithm.

    ── Divide phase ──
    The input is split into two roughly equal halves.  We keep splitting
    until every sub-list contains zero or one element (the base case),
    which is trivially sorted.

    ── Conquer phase ──
    Pairs of sorted sub-lists are merged back together by the `merge`
    helper, producing a single sorted list at each level of recursion.

    Time complexity : O(n log n) — every level does O(n) merge work and
                      there are O(log n) levels.
    Space complexity: O(n)       — the temporary lists created during merging.
    """

    # ── Base case ──
    # A list of length 0 or 1 is already sorted; no work needed.
    if len(array) <= 1:
        return array

    # ── Divide ──
    # Find the midpoint and split the list into left and right halves.
    mid = len(array) // 2
    left_half = array[:mid]    # elements from index 0   up to (but not including) mid
    right_half = array[mid:]   # elements from index mid up to the end

    # Recursively sort each half.  This keeps dividing until we hit the
    # base case, then the merge calls on the way back up do the real work.
    sorted_left = merge_sort(left_half)
    sorted_right = merge_sort(right_half)

    # ── Conquer ──
    # Merge the two sorted halves into one sorted list.
    return merge(sorted_left, sorted_right)


def merge(left: list, right: list) -> list:
    """
    Merge two already-sorted lists into a single sorted list.

    ── How it works ──
    We maintain one pointer for each input list (i for *left*, j for
    *right*).  At each step we compare the elements at the two pointers
    and append the smaller one to the result.  When one list is exhausted
    we append whatever remains in the other — those elements are already
    sorted and are all greater than or equal to the last element we added.
    """

    result = []   # the merged output
    i = 0         # pointer into `left`
    j = 0         # pointer into `right`

    # ── Main comparison loop ──
    # Walk both lists in tandem, always picking the smaller current element.
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            # left's current element is smaller (or equal) — take it.
            # Using <= (not <) keeps the sort *stable*: equal elements
            # preserve their original relative order.
            result.append(left[i])
            i += 1
        else:
            # right's current element is smaller — take it.
            result.append(right[j])
            j += 1

    # ── Remaining-element sweep ──
    # Exactly one of these two slices will be non-empty.  Extend the
    # result with whatever is left over.
    result.extend(left[i:])    # remaining elements in left  (if any)
    result.extend(right[j:])   # remaining elements in right (if any)

    return result


# ─────────────────────────────────────────────────────────────────────
# Demonstration
# ─────────────────────────────────────────────────────────────────────

def demo(label: str, array: list) -> None:
    """Pretty-print a before/after pair."""
    sorted_array = merge_sort(array)
    print(f"  {label}")
    print(f"    Before: {array}")
    print(f"    After:  {sorted_array}")
    print()


if __name__ == "__main__":
    print("=" * 60)
    print("  MERGE SORT DEMO")
    print("=" * 60)
    print()

    # 1. Random unsorted list
    demo("1) Random unsorted list", [38, 27, 43, 3, 9, 82, 10])

    # 2. Already sorted list — merge sort still runs in O(n log n),
    #    but every merge comparison picks from the left half first.
    demo("2) Already sorted list", [1, 2, 3, 4, 5, 6, 7])

    # 3. Reverse-sorted list — worst case for many naive algorithms,
    #    but merge sort handles it in the same O(n log n) time.
    demo("3) Reverse-sorted list", [9, 8, 7, 6, 5, 4, 3, 2, 1])

    # 4. List with duplicates — the stable <= comparison in `merge`
    #    ensures duplicate values stay in their original order.
    demo("4) List with duplicates", [5, 3, 8, 3, 1, 5, 8, 1])

    # 5. Empty list — the base case catches this immediately.
    demo("5) Empty list", [])

    # 6. Single-element list — also caught by the base case.
    demo("6) Single-element list", [42])

    # 7. All identical elements — a good edge-case stress test.
    demo("7) All identical elements", [7, 7, 7, 7, 7])

    print("=" * 60)
    print("  All examples sorted successfully!")
    print("=" * 60)
