import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Book } from "../model/book.model.js";

function createBook(overrides = {}) {
  return new Book({
    shopId: new mongoose.Types.ObjectId(),
    title: "Test book",
    author: "Test author",
    category: new mongoose.Types.ObjectId(),
    price: 10,
    stock: 1,
    ...overrides,
  });
}

test("books are not marked 18+ by default", () => {
  assert.equal(createBook().is18Plus, false);
});

test("a seller can mark a book as 18+", () => {
  assert.equal(createBook({ is18Plus: true }).is18Plus, true);
});
