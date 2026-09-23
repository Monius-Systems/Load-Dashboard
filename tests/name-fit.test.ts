import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFit } from '../lib/load-desk/format.ts';

// The two names at the top of a printed invoice -- the client's on the left and
// the company's own on the right -- sit in blocks of a fixed width, so that the
// word INVOICE between them stays on the centre of the page whoever is being
// billed. A name too long for its block is set smaller to fit it. What each
// name measures is taken in the browser; this is the sum that turns that
// measurement into a size, and what prints depends on it.

// A width of 100 at 100px is one pixel of name per pixel of size, which makes
// the arithmetic in these tests readable: room 250 is room for 250px of name.
const PER_PIXEL = 100;

void test('a name that fits is printed at full size', () => {
  assert.deepEqual(nameFit(PER_PIXEL, 250, 17, 13), { size: 17, wrapped: false });
  // Exactly filling the room it has is fitting.
  assert.deepEqual(nameFit(PER_PIXEL, 17, 17, 13), { size: 17, wrapped: false });
});

void test('a name too wide is set at the size that fits, not a step down', () => {
  assert.deepEqual(nameFit(PER_PIXEL, 15, 17, 13), { size: 15, wrapped: false });
  assert.deepEqual(nameFit(PER_PIXEL, 14.5, 17, 13), { size: 14.5, wrapped: false });
});

void test('sizes are taken down to the half pixel, never up', () => {
  // 14.9px of room is printed at 14.5, not rounded up to 15 and overflowed.
  assert.equal(nameFit(PER_PIXEL, 14.9, 17, 13).size, 14.5);
  assert.equal(nameFit(PER_PIXEL, 16.99, 17, 13).size, 16.5);
});

void test('a name is never set smaller than the address lines under it', () => {
  // Below the minimum there are no sizes left to give up, so it wraps: a
  // client billed to two lines is ordinary on an invoice, a name set smaller
  // than its own street address is not.
  assert.deepEqual(nameFit(PER_PIXEL, 12.9, 17, 13), { size: 13, wrapped: true });
  assert.deepEqual(nameFit(PER_PIXEL, 2, 17, 13), { size: 13, wrapped: true });
  assert.deepEqual(nameFit(PER_PIXEL, 6, 15, 12), { size: 12, wrapped: true });
});

void test('an empty name asks for no room and takes full size', () => {
  assert.deepEqual(nameFit(0, 250, 17, 13), { size: 17, wrapped: false });
});

// The sizes the invoice actually asks for, against the room its two blocks
// have: about 258px beside the BILL TO label, and about 343px for the company.

void test('the reference invoice prints its client name close to full size', () => {
  // 'Z-FORCE TRANSPORTATION INC.' measures 1727 at 100px, tracking included.
  const fit = nameFit(1727, 258, 17, 13);
  assert.equal(fit.wrapped, false);
  assert.ok(fit.size >= 14.5 && fit.size <= 15, `printed at ${fit.size}px`);
});

void test('a client name that fits outright is left alone', () => {
  // 'K FIVE CONSTRUCTION' measures 1155 at 100px, tracking included.
  assert.deepEqual(nameFit(1155, 258, 17, 13), { size: 17, wrapped: false });
});

void test('a long company name is set smaller rather than run off the page', () => {
  // 'Kowalczyk & Sons Heavy Hauling of Greater Chicagoland' measures 2734 at
  // 100px -- 410px at full size, where the block has 343.
  assert.deepEqual(nameFit(2734, 343, 15, 12), { size: 12.5, wrapped: false });
});

void test('a company name longer than any size can hold takes a second line', () => {
  assert.deepEqual(nameFit(3500, 343, 15, 12), { size: 12, wrapped: true });
});
