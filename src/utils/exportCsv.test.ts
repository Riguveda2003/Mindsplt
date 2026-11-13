import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsvFilename,
  escapeCsvCell,
  generateTripCsv,
} from './exportCsv';
import { createInitialState } from './storage';

test('escapes CSV cells with commas, quotes, and newlines according to RFC 4180', () => {
  assert.equal(escapeCsvCell('plain'), 'plain');
  assert.equal(escapeCsvCell('Aarav, Maya'), '"Aarav, Maya"');
  assert.equal(escapeCsvCell('Café "Kyoto"'), '"Café ""Kyoto"""');
  assert.equal(escapeCsvCell('Line1\nLine2'), '"Line1\nLine2"');
});

test('generates CSV containing both trip expenses and settlement records with home-currency conversions', () => {
  const seed = createInitialState();
  // Goa Coastal Retreat has 2 expenses and 1 settlement record in INR
  const goaTrip = seed.trips[1];
  const csv = generateTripCsv(goaTrip);
  const lines = csv.split('\r\n');

  // Header + 2 expenses + 1 settlement = 4 rows
  assert.equal(lines.length, 4);
  assert.ok(lines[0].includes('Record Type,Date,Description'));
  assert.ok(lines[0].includes('Converted Amount (INR)'));

  // Expense rows
  assert.ok(csv.includes('Expense,2026-10-19,Sunset Kayaking Booking'));
  assert.ok(csv.includes('45.00,USD,3802.50,INR'));
  assert.ok(csv.includes('Expense,2026-10-18,Assagao Villa Deposit'));

  // Settlement row
  assert.ok(csv.includes('Settlement,2026-10-20,Kabir Shah settled with Rohan Nair'));
  assert.ok(csv.includes('4500.00,INR,4500.00,INR'));
});

test('builds sanitized CSV filenames from trip names', () => {
  assert.equal(
    buildCsvFilename('Kyoto & Osaka Autumn'),
    'kyoto-osaka-autumn-ledger.csv'
  );
  assert.equal(buildCsvFilename('   '), 'mindsplt-trip-ledger.csv');
});
