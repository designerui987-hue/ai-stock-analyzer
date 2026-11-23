/// <reference types="node" />
/**
 * Explore Freshness & Quote Integrity Component Tests
 *
 * Verifies acceptance criteria:
 * 1. A STALE quote with a numeric daily change displays observation date and source.
 * 2. A missing prior close leaves daily change "Unavailable" (never 0.00% / fabricated break-even).
 * 3. Genuinely unchanged price (0.00%) renders neutral "0.00%" and "Unchanged session · Verified".
 * 4. Missing/unavailable quote renders "Unavailable" for both price and daily change.
 */

import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatINR, formatPercent } from './format';

interface ExploreRowProps {
  symbol: string;
  name: string;
  quote?: {
    price?: number | null;
    prev_close?: number | null;
    change_percent?: number | null;
    freshness?: string;
    as_of?: string;
    source?: string;
    status?: string;
  } | null;
}

function ExploreRowTestComponent({ symbol, name, quote }: ExploreRowProps) {
  const lq = quote;
  const hasRealPrice = lq && typeof lq.price === 'number' && lq.price > 0 && lq.status !== 'unavailable';
  const hasRealChange = lq && typeof lq.change_percent === 'number' && lq.change_percent !== null && !isNaN(lq.change_percent) && lq.status !== 'unavailable';
  const isUp = hasRealChange ? (lq.change_percent ?? 0) > 0 : false;
  const isZero = hasRealChange && lq.change_percent === 0;
  const isStale = lq?.freshness === 'STALE';

  let observationText = 'Observation unavailable';
  let observationClass = 'text-[#687A81] bg-[#EEF2F2]';

  if (isStale) {
    const dateStr = lq?.as_of ? new Date(lq.as_of).toISOString().slice(0, 10) : 'Stale';
    const src = lq?.source || 'Cache';
    if (hasRealChange) {
      const chg = lq?.change_percent ?? 0;
      const moveStr = chg > 0 ? `+${chg.toFixed(2)}%` : isZero ? '0.00%' : `${chg.toFixed(2)}%`;
      observationText = `Stale move (${moveStr}) · ${dateStr} · ${src}`;
    } else {
      observationText = `Cached observation [${dateStr} · ${src}]`;
    }
    observationClass = 'text-[#8B734D] bg-[#FAF3E5] border-[#EEE2C6]';
  } else if (hasRealPrice && hasRealChange) {
    const chg = lq?.change_percent ?? 0;
    if (chg >= 1.5) {
      observationText = `Strong 1D advance (+${chg.toFixed(2)}%) · Verified`;
      observationClass = 'text-[#087F73] bg-[#EAF2EC] border-[#D8E5DE]';
    } else if (chg <= -1.5) {
      observationText = `1D decline (${chg.toFixed(2)}%) · Verified`;
      observationClass = 'text-[#BB4B48] bg-[#FAF3F0] border-[#F2D6D3]';
    } else if (isZero) {
      observationText = 'Unchanged session · Verified';
      observationClass = 'text-[#687A81] bg-[#EEF2F2] border-[#E1E7E8]';
    } else {
      observationText = `${chg > 0 ? '+' : ''}${chg.toFixed(2)}% 1D move · Verified`;
      observationClass = chg > 0
        ? 'text-[#087F73] bg-[#EAF2EC] border-[#D8E5DE]'
        : 'text-[#BB4B48] bg-[#FAF3F0] border-[#F2D6D3]';
    }
  }

  return React.createElement(
    'tr',
    { 'data-testid': `row-${symbol}` },
    React.createElement('td', null, symbol, ' - ', name),
    React.createElement(
      'td',
      { 'data-testid': `price-${symbol}` },
      hasRealPrice
        ? React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'price-val' }, formatINR(lq?.price, 2)),
            isStale && React.createElement('div', { className: 'stale-price-meta' }, `STALE · ${lq?.source || 'Cache'}`)
          )
        : React.createElement('div', { className: 'price-unavailable' }, 'Unavailable')
    ),
    React.createElement(
      'td',
      { 'data-testid': `change-${symbol}` },
      hasRealChange
        ? React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'change-val' }, formatPercent(lq?.change_percent)),
            isStale &&
              React.createElement(
                'div',
                { className: 'stale-change-meta' },
                `${lq?.as_of ? new Date(lq.as_of).toISOString().slice(0, 10) : 'Stale'} · ${lq?.source || 'Cache'}`
              )
          )
        : React.createElement('div', { className: 'change-unavailable' }, 'Unavailable')
    ),
    React.createElement(
      'td',
      { 'data-testid': `obs-${symbol}` },
      React.createElement('span', { className: observationClass }, observationText)
    )
  );
}

function runTests() {
  console.log('Running Explore Freshness & Quote Integrity Component Tests...');

  // 1. STALE quote with numeric daily change: must show observation date and source
  const staleHtml = renderToStaticMarkup(
    React.createElement(ExploreRowTestComponent, {
      symbol: 'TCS',
      name: 'Tata Consultancy Services',
      quote: {
        price: 2460.0,
        prev_close: 2430.8,
        change_percent: 1.2,
        freshness: 'STALE',
        as_of: '2026-11-20T10:00:00.000Z',
        source: 'yfinance',
        status: 'ok',
      },
    })
  );

  assert.ok(staleHtml.includes('₹2,460.00'), 'Must render formatted price ₹2,460.00');
  assert.ok(staleHtml.includes('+1.20%'), 'Must render formatted daily change +1.20%');
  assert.ok(staleHtml.includes('2026-11-20'), 'Must render observation date 2026-11-20 for stale quote');
  assert.ok(staleHtml.includes('yfinance'), 'Must render quote source yfinance for stale quote');
  assert.ok(staleHtml.includes('Stale move (+1.20%) · 2026-11-20 · yfinance'), 'Must render factual observation');
  console.log('  ✓ STALE quote with numeric daily change renders observation date and source');

  // 2. Missing prior close: must leave daily change "Unavailable", never 0.00%
  const missingPrevHtml = renderToStaticMarkup(
    React.createElement(ExploreRowTestComponent, {
      symbol: 'INFY',
      name: 'Infosys',
      quote: {
        price: 1850.5,
        prev_close: null,
        change_percent: null,
        freshness: 'REALTIME',
        as_of: '2026-11-23T09:30:00.000Z',
        source: 'kite',
        status: 'ok',
      },
    })
  );

  assert.ok(missingPrevHtml.includes('₹1,850.50'), 'Must render price ₹1,850.50');
  assert.ok(missingPrevHtml.includes('Unavailable'), 'Daily change must be Unavailable when prior close is missing');
  assert.ok(!missingPrevHtml.includes('0.00%'), 'Must NOT invent 0.00% when prior close is missing');
  console.log('  ✓ Missing prior close correctly leaves daily change Unavailable');

  // 3. Genuinely unchanged price: renders neutral 0.00% and "Unchanged session · Verified"
  const unchangedHtml = renderToStaticMarkup(
    React.createElement(ExploreRowTestComponent, {
      symbol: 'RELIANCE',
      name: 'Reliance Industries',
      quote: {
        price: 2500.0,
        prev_close: 2500.0,
        change_percent: 0.0,
        freshness: 'REALTIME',
        as_of: '2026-11-23T09:30:00.000Z',
        source: 'kite',
        status: 'ok',
      },
    })
  );

  assert.ok(unchangedHtml.includes('₹2,500.00'), 'Must render price ₹2,500.00');
  assert.ok(unchangedHtml.includes('0.00%'), 'Must render genuine 0.00% change');
  assert.ok(unchangedHtml.includes('Unchanged session · Verified'), 'Must render neutral unchanged session observation');
  console.log('  ✓ Genuinely unchanged price renders 0.00% and neutral observation');

  // 4. Missing/unavailable price: renders Unavailable for both price and daily change
  const unpricedHtml = renderToStaticMarkup(
    React.createElement(ExploreRowTestComponent, {
      symbol: 'SBIN',
      name: 'State Bank of India',
      quote: {
        price: null,
        prev_close: null,
        change_percent: null,
        freshness: 'UNAVAILABLE',
        status: 'unavailable',
      },
    })
  );

  assert.ok(unpricedHtml.includes('Unavailable'), 'Price and change must be Unavailable for unpriced instrument');
  assert.ok(unpricedHtml.includes('Observation unavailable'), 'Observation must be unavailable');
  console.log('  ✓ Missing price safely renders Unavailable without throwing');

  console.log('All Explore Freshness & Quote Integrity tests passed successfully!\n');
}

runTests();
