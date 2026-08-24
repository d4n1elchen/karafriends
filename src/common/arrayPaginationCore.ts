export interface ArrayPageItem<T> {
  item: T;
  cursor: string;
}

export interface ArrayPage<T> {
  items: ArrayPageItem<T>[];
  endCursor: string;
  hasNextPage: boolean;
}

export function paginateArray<T>(
  items: readonly T[],
  offset: number,
  limit: number,
): ArrayPage<T> {
  const start = Math.max(0, offset);
  const count = Math.max(0, limit);
  const end = Math.min(start + count, items.length);

  return {
    items: items.slice(start, end).map((item, index) => ({
      item,
      cursor: (start + index + 1).toString(),
    })),
    endCursor: end.toString(),
    hasNextPage: end < items.length,
  };
}
