import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveBranchInventory, stockStatus } from "../src/lib/branchStockBalanceCore.js";

const products = [{ id: "IZZI", name: "IZZI Taro", sku: "IZZI-TARO", brand: "IZZI", category_name: "Liquid", product_type: "Liquid", min_stock: 10, purchase_price: 55000 }];
const legacy = (branch = "PATRANG") => [{ id: `${branch}-A`, branch_id: branch, branch_code: branch.slice(0,3), product_id: "IZZI", warehouse_id: "A", quantity: 60 }, { id: `${branch}-B`, branch_id: branch, branch_code: branch.slice(0,3), product_id: "IZZI", warehouse_id: "B", quantity: 40 }];
const resolve = (balances, branchIds = null) => resolveBranchInventory({ balances, products, branchIds });

test("A - legacy only resolves 100", () => assert.equal(resolve(legacy())[0].quantity, 100));
test("B - branch balance 90 overrides legacy 100", () => assert.equal(resolve([...legacy(), { id: "BR", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity: 90 }])[0].quantity, 90));
test("C - branch 120 is not double counted with legacy", () => assert.equal(resolve([...legacy(), { id: "BR", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity: 120 }])[0].quantity, 120));
test("D - multi branch total resolves to 140", () => { const rows = [...legacy(), ...legacy("MASTRIP").map((row, index) => ({ ...row, quantity: index ? 20 : 30 })), { id: "BR", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity: 90 }]; assert.equal(resolve(rows).reduce((sum, row) => sum + row.quantity, 0), 140); });
test("E - minimum stock status", () => assert.equal(stockStatus(5, 10), "MENIPIS"));
test("F - zero stock status", () => assert.equal(stockStatus(0, 10), "HABIS"));
test("G - inventory value uses resolved quantity times unit cost", () => { const row = resolve([{ id: "BR", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity: 10 }])[0]; assert.equal(row.inventory_value, 550000); });
test("H - branch scope excludes other branches", () => { const rows = [...legacy(), ...legacy("MASTRIP")]; const result = resolve(rows, ["PATRANG"]); assert.equal(result.length, 1); assert.equal(result[0].branch_id, "PATRANG"); });

const page = await readFile(new URL("../src/pages/Stock.jsx", import.meta.url), "utf8");
test("I - Head Office has all-branch and branch-specific filter", () => { assert.match(page, /isSuperAdmin/); assert.match(page, /Semua Cabang/); assert.match(page, /setSelectedBranchId/); });
test("J - Inventory UI has no warehouse dependency", () => { assert.doesNotMatch(page, /warehouse|gudang/i); assert.match(page, /searchKeys=\{\["sku", "product_name", "brand", "category_name"\]\}/); });
test("bulk resolver performs no entity query or write", () => { const source = resolveBranchInventory.toString(); assert.doesNotMatch(source, /entities|\.create|\.update|\.delete/); });
