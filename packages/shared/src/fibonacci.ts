export function fibonacci(n: number): number {
  if (n < 0) {
    throw new RangeError("n must be a non-negative integer");
  }
  if (n === 0) return 0;
  if (n === 1) return 1;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
