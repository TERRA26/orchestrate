/**
 * Bounded least-recently-used map. Wraps `Map` and uses its insertion order
 * to track recency: every `get` and `set` moves the affected key to the end
 * of the iteration order, so the *first* key (the one returned by
 * `keys().next()`) is always the least recently used. When `set` would push
 * the size past `maxSize`, the LRU key is evicted.
 *
 * Picked over a fancier doubly-linked list implementation because the
 * built-in Map already keeps insertion order in O(1) and our worst-case
 * sizes are in the low thousands.
 *
 * @see ORC-049
 * @module LruMap
 */

export interface LruMapOptions {
  /**
   * Maximum number of entries before the oldest is evicted on the next
   * `set`. Must be a positive integer; values <= 0 are treated as 1.
   */
  readonly maxSize: number;
  /**
   * Optional callback invoked when an entry is evicted because the map is
   * full. Not called for explicit `delete` or `clear`. Errors are not
   * caught by the map; raise them only when you intend the producer to
   * see the failure.
   */
  readonly onEvict?: ((key: unknown, value: unknown) => void) | undefined;
}

export class LruMap<K, V> {
  readonly #store = new Map<K, V>();
  readonly #maxSize: number;
  readonly #onEvict?: ((key: K, value: V) => void) | undefined;

  constructor(options: LruMapOptions) {
    this.#maxSize = Math.max(1, Math.floor(options.maxSize));
    this.#onEvict = options.onEvict as ((key: K, value: V) => void) | undefined;
  }

  /** Maximum entries the map will retain. */
  get maxSize(): number {
    return this.#maxSize;
  }

  /** Current number of entries. */
  get size(): number {
    return this.#store.size;
  }

  /**
   * Returns the value for `key` if present, or `undefined`. Touching the
   * key moves it to the most-recent position, so subsequent evictions
   * skip it.
   */
  get(key: K): V | undefined {
    const value = this.#store.get(key);
    if (value === undefined && !this.#store.has(key)) {
      return undefined;
    }
    // Re-insert to move to most-recent position.
    this.#store.delete(key);
    this.#store.set(key, value as V);
    return value;
  }

  /**
   * Returns true when the key is present without updating recency. Use
   * sparingly; prefer `get` so the map can age out unused entries.
   */
  has(key: K): boolean {
    return this.#store.has(key);
  }

  /**
   * Inserts or replaces `key`. If insertion would push size past
   * `maxSize`, the least recently used entry is evicted first and
   * `onEvict` is fired.
   */
  set(key: K, value: V): this {
    if (this.#store.has(key)) {
      // Replacing: keep behavior identical to Map but make sure we end
      // up at the most-recent position.
      this.#store.delete(key);
      this.#store.set(key, value);
      return this;
    }
    if (this.#store.size >= this.#maxSize) {
      const oldestKey = this.#store.keys().next().value as K | undefined;
      if (oldestKey !== undefined) {
        const oldestValue = this.#store.get(oldestKey);
        this.#store.delete(oldestKey);
        if (this.#onEvict && oldestValue !== undefined) {
          this.#onEvict(oldestKey, oldestValue);
        }
      }
    }
    this.#store.set(key, value);
    return this;
  }

  /** Removes the entry without firing `onEvict`. */
  delete(key: K): boolean {
    return this.#store.delete(key);
  }

  /** Removes all entries without firing `onEvict`. */
  clear(): void {
    this.#store.clear();
  }

  /** Iterate keys in least-recently-used to most-recently-used order. */
  keys(): IterableIterator<K> {
    return this.#store.keys();
  }

  /** Iterate values in least-recently-used to most-recently-used order. */
  values(): IterableIterator<V> {
    return this.#store.values();
  }
}
