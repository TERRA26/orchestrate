"""Recursion demo module showing factorial, Fibonacci, and sum-of-list examples."""
from __future__ import annotations

from typing import List


def factorial(n: int) -> int:
    """Compute n! recursively with clear base and recursive cases."""
    # Base case: once n is 0 or 1, recursion stops and returns 1 directly.
    if n <= 1:
        return 1

    # Recursive case: multiply n by the factorial of the smaller subproblem (n - 1).
    # Each recursive call pushes a new frame on the call stack until the base case is reached,
    # then the stack unwinds multiplying the results in reverse order.
    return n * factorial(n - 1)


def fibonacci(n: int) -> int:
    """Return the nth Fibonacci number using recursion."""
    # Base cases: fib(0) = 0 and fib(1) = 1 terminate the recursion immediately.
    if n <= 0:
        return 0
    if n == 1:
        return 1

    # Recursive case: fib(n) = fib(n - 1) + fib(n - 2).
    # Two recursive calls are made, so the call stack branches like a binary tree.
    # The stack depth decreases as each branch hits a base case and returns upward.
    return fibonacci(n - 1) + fibonacci(n - 2)


def sum_list(values: List[int]) -> int:
    """Recursively sum a list of integers."""
    # Base case: an empty list contributes 0 to the sum.
    if not values:
        return 0

    # Recursive case: sum the head element with the sum of the tail (rest of list).
    # Slicing produces a smaller list, ensuring progress toward the base case.
    head = values[0]
    tail = values[1:]

    # Each recursive call adds another stack frame representing "sum of tail".
    # When the tail is empty, the base case returns 0 and the stack unwinds adding the heads.
    return head + sum_list(tail)


if __name__ == "__main__":
    print("Recursion Demo\n=============")

    fact_input = 5
    print(f"factorial({fact_input}) = {factorial(fact_input)}")

    fib_input = 7
    print(f"fibonacci({fib_input}) = {fibonacci(fib_input)}")

    list_input = [1, 3, 5, 7]
    print(f"sum_list({list_input}) = {sum_list(list_input)}")
