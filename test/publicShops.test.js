import test from "node:test";
import assert from "node:assert/strict";
import { getPublicShops } from "../controller/publicShop.controller.js";
import { getAllBooks } from "../controller/book.controller.js";
import { User } from "../model/user.model.js";
import { Shop } from "../model/shop.model.js";
import { Book } from "../model/book.model.js";
import shopRouter from "../route/shop.route.js";
import { protect } from "../middleware/auth.middleware.js";

const ownerId = "111111111111111111111111";
const shopId = "222222222222222222222222";
function invoke(handler, query = {}) {
  return new Promise((resolve, reject) => handler({ query }, {
    status() { return this; }, json: resolve,
  }, reject));
}

test("public route precedes authentication; admin routes remain protected", () => {
  const publicIndex = shopRouter.stack.findIndex((layer) => layer.route?.path === "/public");
  const authIndex = shopRouter.stack.findIndex((layer) => layer.handle === protect);
  const adminIndex = shopRouter.stack.findIndex((layer) => layer.route?.path === "/");
  assert.ok(publicIndex >= 0 && publicIndex < authIndex && authIndex < adminIndex);
});

test("guest directory paginates active sellers and returns only public fields", async (t) => {
  const calls = {};
  t.mock.method(User, "find", (filter) => {
    calls.filter = filter;
    const chain = {
      select(value) { calls.select = value; return this; },
      sort(value) { calls.sort = value; return this; },
      skip(value) { calls.skip = value; return this; },
      limit(value) { calls.limit = value; return this; },
      async lean() { return [{ _id: ownerId, name: "Seller", email: "private@example.com", address: "Private home" }]; },
    };
    return chain;
  });
  t.mock.method(User, "countDocuments", async (filter) => {
    assert.deepEqual(filter, { role: "seller", deletedAt: null });
    return 5;
  });
  t.mock.method(Shop, "find", (filter) => {
    assert.deepEqual(filter, { owner: { $in: [ownerId] } });
    return { select() { return this; }, async lean() { return [{
      _id: shopId, owner: ownerId, name: "Real bookstore", address: "Public storefront",
      certificate: { url: "private-document" },
      banner: [{ url: "https://example.com/banner.jpg", public_id: "internal" }],
    }]; } };
  });
  const result = await invoke(getPublicShops, { page: "2", limit: "2" });
  assert.equal(result.success, true);
  assert.deepEqual(calls.filter, { role: "seller", deletedAt: null });
  assert.equal(calls.select, "_id name username");
  assert.deepEqual(calls.sort, { createdAt: -1, _id: -1 });
  assert.equal(calls.skip, 2);
  assert.equal(calls.limit, 2);
  assert.deepEqual(result.data.pagination, { page: 2, limit: 2, total: 5, totalPages: 3 });
  assert.deepEqual(result.data.shops, [{ ownerId, shopId, name: "Real bookstore",
    description: "", address: "Public storefront", banner: [{ url: "https://example.com/banner.jpg" }] }]);
});

test("seller without shop uses name fallback without exposing personal address", async (t) => {
  t.mock.method(User, "find", () => ({
    select() { return this; }, sort() { return this; }, skip() { return this; },
    limit() { return this; }, async lean() { return [{ _id: ownerId, name: "Seller", address: "Private" }]; },
  }));
  t.mock.method(User, "countDocuments", async () => 1);
  t.mock.method(Shop, "find", () => ({ select() { return this; }, async lean() { return []; } }));
  const result = await invoke(getPublicShops);
  assert.deepEqual(result.data.shops[0], { ownerId, shopId: null, name: "Seller",
    description: "", address: "", banner: [] });
});

test("invalid public pagination returns 400", async () => {
  for (const query of [{ page: "0" }, { page: "1.5" }, { limit: "51" }, { limit: "bad" }]) {
    await assert.rejects(invoke(getPublicShops, query), { statusCode: 400 });
  }
});

test("existing public book catalog filters both query and count by seller ID", async (t) => {
  const filters = [];
  t.mock.method(Book, "find", (filter) => {
    filters.push(filter);
    return { populate() { return this; }, sort() { return this; },
      skip(value) { assert.equal(value, 20); return this; },
      async limit(value) { assert.equal(value, 20); return []; } };
  });
  t.mock.method(Book, "countDocuments", async (filter) => { filters.push(filter); return 0; });
  const result = await invoke(getAllBooks, { shopId: ownerId, page: "2", limit: "20" });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.books, []);
  assert.deepEqual(filters, [{ shopId: ownerId }, { shopId: ownerId }]);
});
