import { expect, test } from '@playwright/test'
import { generateBatch, generateOne, getCountyOptions, getRemaining, getTotal, inferRegion, resetUsed, setExtraLocs } from '../lib/locatii-romania'

test.afterEach(() => setExtraLocs([]))

test('county selection never leaks addresses from another county', () => {
  for (const { judet, total } of getCountyOptions()) {
    const cards = generateBatch(new Set(), total + 5, judet)
    expect(cards).toHaveLength(total)
    expect(new Set(cards.map(card => card.idx)).size).toBe(total)
    expect(cards.every(card => judet === 'București' ? /^Sector [1-6]$/.test(card.judet) : card.judet === judet)).toBe(true)
  }
})

test('unknown and exhausted counties return no addresses instead of a national fallback', () => {
  expect(generateOne(new Set(), 'Județ inexistent')).toBeNull()
  expect(getTotal('Județ inexistent')).toBe(0)
  const used = new Set(generateBatch(new Set(), getTotal('Alba'), 'Alba').map(card => card.idx))
  expect(getRemaining(used, 'Alba')).toBe(0)
  expect(generateOne(used, 'Alba')).toBeNull()
  expect(generateBatch(used, 4, 'Alba')).toEqual([])
  expect(generateOne(used, 'Iași')?.judet).toBe('Iași')
})

test('all Bucharest sectors share one county option without losing the sector on the address', () => {
  const cards = generateBatch(new Set(), getTotal('București'), 'București')
  expect(new Set(cards.map(card => card.judet)).size).toBe(6)
  expect(getCountyOptions().filter(option => /Sector|București/.test(option.judet))).toHaveLength(1)
  expect(getTotal('Sector 1')).toBe(cards.length)
})

test('county matching accepts missing diacritics and the county prefix', () => {
  expect(generateBatch(new Set(), 8, 'Iasi').every(card => card.judet === 'Iași')).toBe(true)
  expect(getTotal('Jud. Iași')).toBe(getTotal('Iași'))
  expect(getTotal('Iaşi')).toBe(getTotal('Iași'))
})

test('used addresses stay excluded across batch generation and replacement', () => {
  const first = generateBatch(new Set(), 4, 'Iași')
  const used = new Set(first.map(card => card.idx))
  const next = generateBatch(used, 8, 'Iași')
  expect(next.every(card => !used.has(card.idx))).toBe(true)
  expect(used.size).toBe(first.length)
  expect(getRemaining(used, 'Iași')).toBe(getTotal('Iași') - first.length)
  expect(getCountyOptions(used).find(option => option.judet === 'Iași')?.remaining).toBe(getRemaining(used, 'Iași'))
})

test('resetting one county preserves history in the other counties', () => {
  const iasi = generateBatch(new Set(), 3, 'Iași')
  const cluj = generateBatch(new Set(), 2, 'Cluj')
  const used = new Set([...iasi, ...cluj].map(card => card.idx))
  const reset = resetUsed(used, 'Iași')
  expect(reset).toEqual(new Set(cluj.map(card => card.idx)))
  expect(used.size).toBe(5)
  expect(resetUsed(used).size).toBe(0)
})

test('scanned addresses are included in their county with their exact street and number', () => {
  setExtraLocs([{ id: 'test-address', judet: 'Tulcea', localitate: 'Tulcea', strada: 'Strada Test 14A, ap. 2', region: 'alte' }])
  const card = generateOne(new Set(), 'Tulcea')
  expect(card?.adresa).toBe('Strada Test 14A, ap. 2')
  expect(getCountyOptions().find(option => option.judet === 'Tulcea')).toEqual({ judet: 'Tulcea', total: 1, remaining: 1 })
  expect(generateOne(new Set([card!.idx]), 'Tulcea')).toBeNull()
})

test('stale stored indexes never make the available counter negative', () => {
  const used = new Set([-1, getTotal() + 50, getTotal() + 51])
  expect(getRemaining(used)).toBe(getTotal())
  expect(generateBatch(used, 4)).toHaveLength(4)
})

test('scanned county abbreviations join the canonical county instead of creating duplicate options', () => {
  const before = getTotal('Bacău')
  setExtraLocs([{ id: 'test-abbreviation', judet: 'BC', localitate: 'Bacău', strada: 'Strada Test 12', region: inferRegion('BC') }])
  expect(inferRegion('BC')).toBe('moldova')
  expect(getTotal('Bacău')).toBe(before + 1)
  expect(getCountyOptions().some(option => option.judet === 'BC')).toBe(false)
  const card = generateBatch(new Set(), before + 1, 'Bacău').find(card => card.adresa === 'Strada Test 12')
  expect(card?.judet).toBe('Bacău')
})
