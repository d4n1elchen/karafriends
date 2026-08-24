import assert from "node:assert/strict";
import test from "node:test";

import { paginateArray } from "./arrayPaginationCore.ts";

test("paginates an array using the cursor as the next offset", () => {
  const values = Array.from({ length: 65 }, (_, index) => index);
  const first = paginateArray(values, 0, 30);
  const second = paginateArray(values, Number(first.endCursor), 30);
  const third = paginateArray(values, Number(second.endCursor), 30);

  assert.deepEqual(first.items.map(({ item }) => item), values.slice(0, 30));
  assert.deepEqual(second.items.map(({ item }) => item), values.slice(30, 60));
  assert.deepEqual(third.items.map(({ item }) => item), values.slice(60, 65));
  assert.equal(first.items.at(-1)?.cursor, first.endCursor);
  assert.equal(second.endCursor, "60");
  assert.equal(first.hasNextPage, true);
  assert.equal(second.hasNextPage, true);
  assert.equal(third.hasNextPage, false);
});
