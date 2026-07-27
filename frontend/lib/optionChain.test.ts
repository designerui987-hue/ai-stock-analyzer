import assert from 'node:assert';
import {
  calculatePCR,
  calculateMaxPain,
  inferSupportResistance,
  getIVSkewSummary,
  calculateRollover,
  generateMockOptionChain,
} from './optionChain.ts';
import type { OptionChainEntry } from './optionChain.ts';

console.log('Running Option Chain Calculation Tests...');

// Mock dataset for precise test assertions
const sampleChain: OptionChainEntry[] = [
  {
    symbol: 'RELIANCE',
    expiry_date: '2026-07-30',
    strike_price: 2400,
    call: { oi: 10000, oi_change: 2000, volume: 5000, iv: 18.0, ltp: 110, bid: 109, ask: 111 },
    put: { oi: 50000, oi_change: 8000, volume: 20000, iv: 22.0, ltp: 10, bid: 9.5, ask: 10.5 },
  },
  {
    symbol: 'RELIANCE',
    expiry_date: '2026-07-30',
    strike_price: 2450,
    call: { oi: 25000, oi_change: 5000, volume: 12000, iv: 19.5, ltp: 65, bid: 64, ask: 66 },
    put: { oi: 30000, oi_change: 3000, volume: 15000, iv: 20.0, ltp: 35, bid: 34, ask: 36 },
  },
  {
    symbol: 'RELIANCE',
    expiry_date: '2026-07-30',
    strike_price: 2500,
    call: { oi: 60000, oi_change: 12000, volume: 30000, iv: 21.0, ltp: 30, bid: 29, ask: 31 },
    put: { oi: 15000, oi_change: -1000, volume: 8000, iv: 18.5, ltp: 75, bid: 74, ask: 76 },
  },
];

// Test 1: PCR Calculation
{
  // Put Total: 50000 + 30000 + 15000 = 95000
  // Call Total: 10000 + 25000 + 60000 = 95000
  // PCR = 95000 / 95000 = 1.00
  const pcr = calculatePCR(sampleChain);
  assert.strictEqual(pcr, 1.0);
  console.log('  ✓ PCR calculation test passed');
}

// Test 2: Max Pain Calculation
{
  // Evaluate loss at each strike:
  // At 2400:
  //   Calls: 2400 > 2400 (0), 2400 > 2450 (0), 2400 > 2500 (0) => 0
  //   Puts:
  //     Strike 2400: loss 0
  //     Strike 2450: (2450 - 2400) * 30000 = 1,500,000
  //     Strike 2500: (2500 - 2400) * 15000 = 1,500,000
  //   Total loss at 2400 = 3,000,000
  //
  // At 2450:
  //   Calls:
  //     Strike 2400: (2450 - 2400) * 10000 = 500,000
  //   Puts:
  //     Strike 2500: (2500 - 2450) * 15000 = 750,000
  //   Total loss at 2450 = 1,250,000 (Minimum Loss!)
  //
  // At 2500:
  //   Calls:
  //     Strike 2400: (2500 - 2400) * 10000 = 1,000,000
  //     Strike 2450: (2500 - 2450) * 25000 = 1,250,000
  //   Puts: 0
  //   Total loss at 2500 = 2,250,000
  
  const maxPain = calculateMaxPain(sampleChain);
  assert.strictEqual(maxPain, 2450);
  console.log('  ✓ Max Pain calculation test passed');
}

// Test 3: Support / Resistance Inference
{
  const spotPrice = 2470;
  const { support, resistance } = inferSupportResistance(sampleChain, spotPrice);
  
  // Below spot (2470): strikes 2400 (Put OI 50000) and 2450 (Put OI 30000). Max Put OI below spot = 2400.
  assert.strictEqual(support, 2400);

  // Above spot (2470): strike 2500 (Call OI 60000). Max Call OI above spot = 2500.
  assert.strictEqual(resistance, 2500);

  console.log('  ✓ Support & Resistance inference test passed');
}

// Test 4: Rollover % Calculation
{
  const nearOI = 700;
  const nextOI = 300;
  // 300 / (700 + 300) = 30%
  const roll = calculateRollover(nearOI, nextOI);
  assert.strictEqual(roll, 30.0);
  console.log('  ✓ Rollover % calculation test passed');
}

// Test 5: Mock Chain Generator Output Integrity
{
  const chain = generateMockOptionChain('RELIANCE', 2487.35);
  assert.strictEqual(chain.length, 17);
  assert.ok(chain.some(e => e.strike_price === 2500), 'Contains ATM strike 2500');
  console.log('  ✓ Mock option chain generator integrity test passed');
}

console.log('✅ All Option Chain Calculation Tests Passed Successfully!');
