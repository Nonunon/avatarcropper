// run with: npm test (node's built-in runner, types stripped by node itself) //
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    defaultCrop, clampCrop, moveCrop, centerCrop, hitTest, cornerAt,
    resizeFromCorner, resizeFromCenter, roundCrop, rotateCrop, rotatedBounds,
} from "../src/js/crop.ts";

const b = { width: 400, height: 300 };

test("default crop is a top-left square half the short side", () => {
    assert.deepEqual(defaultCrop(b), { x: 0, y: 0, size: 150 });
});

test("clamp keeps the square inside and shrinks it only when it can't fit", () => {
    assert.deepEqual(clampCrop({ x: 350, y: -20, size: 100 }, b), { x: 300, y: 0, size: 100 });
    assert.deepEqual(clampCrop({ x: 10, y: 10, size: 999 }, b), { x: 10, y: 0, size: 300 });
});

test("move is clamped at the edges", () => {
    assert.deepEqual(moveCrop({ x: 290, y: 0, size: 100 }, 50, -5, b), { x: 300, y: 0, size: 100 });
});

test("center", () => {
    assert.deepEqual(centerCrop({ x: 0, y: 0, size: 100 }, b), { x: 150, y: 100, size: 100 });
});

test("hit test: circle moves, square corners resize, outside does nothing", () => {
    let c = { x: 100, y: 100, size: 100 };
    assert.equal(hitTest(c, 150, 150), "move");
    assert.equal(hitTest(c, 102, 102), "resize");
    assert.equal(hitTest(c, 50, 50), "none");
    assert.equal(cornerAt(c, 190, 110), "ne");
    assert.equal(cornerAt(c, 110, 190), "sw");
});

test("corner resize pins the opposite corner", () => {
    let c = { x: 100, y: 100, size: 100 };
    // drag the south-east corner out: north-west stays at 100,100 //
    assert.deepEqual(resizeFromCorner(c, "se", 260, 230, b), { x: 100, y: 100, size: 160 });
    // drag the north-west corner in: south-east stays at 200,200 //
    assert.deepEqual(resizeFromCorner(c, "nw", 150, 170, b), { x: 150, y: 150, size: 50 });
});

test("corner resize stops at the bounds and never flips", () => {
    let c = { x: 100, y: 100, size: 100 };
    assert.deepEqual(resizeFromCorner(c, "se", 999, 999, b), { x: 100, y: 100, size: 200 });
    let past = resizeFromCorner(c, "se", 0, 0, b);
    assert.equal(past.x, 100);
    assert.equal(past.y, 100);
    assert.equal(past.size, 1);
});

test("center resize grows around the middle and stops at the nearest edge", () => {
    let c = { x: 150, y: 100, size: 100 };
    assert.deepEqual(resizeFromCenter(c, 280, 150, b), { x: 120, y: 70, size: 160 });
    assert.deepEqual(resizeFromCenter(c, 999, 150, b), { x: 50, y: 0, size: 300 });
});

test("rounding, optionally about the center", () => {
    assert.deepEqual(roundCrop({ x: 10.4, y: 9.6, size: 99.5 }), { x: 10, y: 10, size: 100 });
    assert.deepEqual(roundCrop({ x: 10.25, y: 10.25, size: 99.5 }, true), { x: 10, y: 10, size: 100 });
});

test("rotated bounds", () => {
    let r = rotatedBounds(400, 300, 90);
    assert.ok(Math.abs(r.width - 300) < 1e-9 && Math.abs(r.height - 400) < 1e-9);
    let d = rotatedBounds(100, 100, 45);
    assert.ok(Math.abs(d.width - 141.421) < 0.01);
});

test("rotating keeps the crop over the same spot of the image", () => {
    // crop centered at (300,150): right of center by 100 //
    let c = { x: 250, y: 100, size: 100 };
    let to = rotatedBounds(400, 300, 90);
    let r = rotateCrop(c, b, to, 90);
    // a quarter turn clockwise moves "right of center" to "below center" //
    assert.ok(Math.abs(r.x + 50 - to.width / 2) < 1e-9);
    assert.ok(Math.abs(r.y + 50 - (to.height / 2 + 100)) < 1e-9);
});
