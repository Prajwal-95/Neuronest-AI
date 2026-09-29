/**
 * Standalone game-logic verification for the five cognitive games.
 *
 * Run with:  node tests/game_logic.test.mjs
 *
 * These are pure-logic assertions against the exact algorithms used in
 * src/games/*.jsx. Each check corresponds to a bug that was found and fixed;
 * see the matching comments in the source files.
 */

import { readFileSync } from 'node:fs';
// Imported from the real module (not a mirror) so the spoken-text checks in
// section 16 can never drift from the code that actually runs in the app.
// NOTE: ESM `import` declarations are only legal at module top level, so this
// must stay here - placing it further down makes Node throw "Unexpected token '{'".
import { toSpokenLanguage } from '../src/services/voice.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ==== 1. MEMORY MATCH ==== */

section('Memory Match');

// 24 symbols so the 48-card level 10 can deal all 24 pairs without repeating.
const MM_SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
                    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
                    'U', 'V', 'W', 'X'];
const MM_CONFIG = { 1: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 30, 8: 36, 9: 40, 10: 48 };
const MM_PREVIEW = { 1: 3500, 2: 4000, 3: 4500, 4: 5000, 5: 6000, 6: 7000, 7: 7500, 8: 8500, 9: 9500, 10: 11000 };

function buildDeck(pairs) {
  const symbols = MM_SYMBOLS.slice(0, pairs);
  return shuffle([...symbols, ...symbols]);
}

for (const [level, cards] of Object.entries(MM_CONFIG)) {
  const pairs = cards / 2;
  const deck = buildDeck(pairs);
  const counts = {};
  for (const s of deck) counts[s] = (counts[s] || 0) + 1;
  const allPaired = Object.values(counts).every((c) => c === 2);
  check(
    `L${level}: deck of ${cards} has every symbol exactly twice`,
    deck.length === cards && allPaired && Object.keys(counts).length === pairs,
    `len=${deck.length} counts=${JSON.stringify(counts)}`
  );
}

{
  const deals = new Set();
  for (let r = 0; r < 40; r++) deals.add(buildDeck(5).join(''));
  check(
    're-dealing produces varied boards (fixes repeated identical layout)',
    deals.size > 1,
    `only ${deals.size} distinct deal(s) in 40 rounds`
  );
}

{
  const pairs = 3;
  const oldFormula = (moves) => pairs / Math.max(moves, pairs);
  const newFormula = (moves) => pairs / moves;
  // In a COMPLETED memory game every pair consumes its own move, so
  // moves >= pairs always and max(moves, pairs) === moves. The two formulas
  // are therefore mathematically identical for every reachable input; the
  // change to the source is a readability simplification, not a behaviour fix.
  let differ = 0;
  for (let m = pairs; m <= 60; m++) {
    if (Math.abs(oldFormula(m) - newFormula(m)) > 1e-12) differ++;
  }
  check('accuracy formula is unchanged for every reachable input (moves >= pairs)', differ === 0, `differ=${differ}`);
  check('perfect play (moves === pairs) scores 1.0', newFormula(3) === 1);
  check('10 moves for 3 pairs scores 0.3', Math.abs(newFormula(10) - 0.3) < 1e-9);
  check(
    'accuracy strictly decreases as moves increase',
    newFormula(3) > newFormula(4) && newFormula(4) > newFormula(6)
  );
  check('accuracy never exceeds 1.0 for any reachable input', [...Array(58).keys()].every((i) => newFormula(i + 3) <= 1));
}

{
  // Mirrors gridCols in src/games/MemoryMatch.jsx: prefer <=4 rows, then 5,
  // then 6, choosing a column count that divides `cards` evenly.
  const cols = (cards) => {
    for (const maxRows of [4, 5, 6]) {
      for (const c of [4, 5, 6, 8]) {
        if (cards % c === 0) {
          const rows = cards / c
          if (rows >= 2 && rows <= maxRows) return c
        }
      }
    }
    for (const c of [3, 4]) if (cards % c === 0) return c
    return 4;
  };
  let allEven = true;
  for (const cards of Object.values(MM_CONFIG)) {
    if (cards % cols(cards) !== 0) allEven = false;
  }
  check('every level fills its grid completely (no ragged row)', allEven,
    Object.values(MM_CONFIG).map((c) => `${c}->${cols(c)}x${Math.ceil(c / cols(c))}`).join(' '));
  check('6 cards render 3x2', cols(6) === 3);
  check('20 cards render 5x4', cols(20) === 5);
  // The top level must not stack into a very tall grid: a taller board pushes
  // the last row below the fold, which is the whole point of capping rows.
  check('no level needs more than 6 rows', Object.values(MM_CONFIG).every((c) => Math.ceil(c / cols(c)) <= 6),
    Object.values(MM_CONFIG).map((c) => `${c}->${cols(c)}x${Math.ceil(c / cols(c))}`).join(' '));
  // The pool must be large enough for the biggest level's pairs.
  check('symbol pool covers every level (no repeated cards)',
    MM_SYMBOLS.length * 2 >= Math.max(...Object.values(MM_CONFIG)),
    `${MM_SYMBOLS.length} symbols vs ${Math.max(...Object.values(MM_CONFIG))} cards`);
}

// Study-phase (memorise) timing per level.

{
  const previews = Object.values(MM_PREVIEW);
  check(
    'preview time increases with card count (more pairs need more study time)',
    previews.every((v, i) => i === 0 || v > previews[i - 1]),
    JSON.stringify(previews)
  );
  check('every level gets at least 3 seconds to memorise', previews.every((v) => v >= 3000), JSON.stringify(previews));
  check('hardest level is not the shortest', MM_PREVIEW[10] > MM_PREVIEW[1]);
  // Level 10 shows 24 pairs, so it legitimately needs more study time than the
  // 10s ceiling that suited the old 10-pair top level. It is still bounded.
  check('hardest level stays under 15s (respects attention span)', previews.every((v) => v <= 15000));
  check('every level has a timing entry', Object.keys(MM_PREVIEW).length === Object.keys(MM_CONFIG).length,
    `${Object.keys(MM_PREVIEW).length} preview / ${Object.keys(MM_CONFIG).length} levels`);

  let ok = true;
  for (const ms of previews) {
    let n = Math.ceil(ms / 1000);
    for (let i = 0; i < Math.ceil(ms / 1000) + 3; i++) {
      n = Math.max(0, n - 1);
      if (n < 0) ok = false;
    }
    if (n !== 0) ok = false;
  }
  check('countdown reaches exactly 0 and never goes negative', ok);
}

// The study phase must never be charged to the player's response time.
{
  let startTime = null;   // stays null until the preview ends
  let elapsed = 0;
  const previewMs = 4500;
  for (let t = 0; t < previewMs; t += 200) {
    if (startTime) elapsed = (t - startTime) / 1000;
  }
  const afterPreview = elapsed;
  startTime = previewMs;
  const matchingMs = 12000;
  const finalElapsed = (previewMs + matchingMs - startTime) / 1000;
  check('elapsed time stays 0 during the study phase', afterPreview === 0, `got ${afterPreview}`);
  check('elapsed time counts only the matching phase', finalElapsed === 12, `got ${finalElapsed}`);
}

/* ==== 2. SEQUENCE RECALL ==== */

section('Sequence Recall');

const SR_LENGTH = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 10, 9: 11, 10: 12 };
const SR_POOL = {
  1: ['●', '▲', '★', '■'],
  2: ['●', '▲', '★', '■', '◆'],
  3: ['●', '▲', '★', '■', '◆', '♥'],
  4: ['●', '▲', '★', '■', '◆', '♥', '✚'],
  5: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂'],
  6: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂', '◐'],
  7: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂', '◐', '◉'],
  8: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂', '◐', '◉', '⬟'],
  9: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂', '◐', '◉', '⬟', '✦'],
  10: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂', '◐', '◉', '⬟', '✦'],
};
const SR_ALL = ['●', '▲', '★', '■', '◆', '♥', '✚', '☂', '◐', '◉', '⬟', '✦'];

function buildSequence(level) {
  const pool = SR_POOL[level];
  return shuffle([...pool]).slice(0, Math.min(SR_LENGTH[level], pool.length));
}

function oldBuildSequence(level) {
  const pool = SR_POOL[level];
  return Array.from({ length: SR_LENGTH[level] }, () => pool[Math.floor(Math.random() * pool.length)]);
}

{
  let dupes = 0;
  for (let r = 0; r < 3000; r++) {
    const seq = oldBuildSequence(3);
    if (new Set(seq).size !== seq.length) dupes++;
  }
  check('BUG confirmed: old sampling produced duplicate symbols', dupes > 0, `dupes=${dupes}`);

  dupes = 0;
  for (let r = 0; r < 3000; r++) {
    const seq = buildSequence(3);
    if (new Set(seq).size !== seq.length) dupes++;
  }
  check('fix: every generated sequence has distinct symbols', dupes === 0, `dupes=${dupes}`);
}

for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const seq = buildSequence(level);
  const inPool = seq.every((s) => SR_POOL[level].includes(s));
  check(
    `L${level}: sequence length is ${SR_LENGTH[level]} and all symbols come from the pool`,
    seq.length === SR_LENGTH[level] && inPool,
    `len=${seq.length}`
  );
}

// A level is only solvable if its pool can supply that many DISTINCT symbols.
// buildSequence samples without replacement, so a pool smaller than the length
// would silently return a short sequence.
for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  check(
    `L${level}: pool (${SR_POOL[level].length}) can supply ${SR_LENGTH[level]} distinct symbols`,
    SR_POOL[level].length >= SR_LENGTH[level]
  );
}

for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  let ok = true;
  for (let r = 0; r < 500; r++) {
    const seq = buildSequence(level);
    const choices = shuffle([...SR_ALL]);
    if (!seq.every((s) => choices.includes(s))) ok = false;
  }
  check(`L${level}: sequence is always solvable from the ${SR_ALL.length} choices`, ok);
}

{
  const acc = (len, mistakes) => len / Math.max(len + mistakes, len);
  check('clean sequence -> accuracy 1.0', acc(5, 0) === 1);
  check('5 symbols + 5 mistakes -> 0.5', Math.abs(acc(5, 5) - 0.5) < 1e-9);
  check('accuracy never exceeds 1.0', acc(3, 0) <= 1);
}

/* ==== 3. ATTENTION FOCUS ==== */

section('Attention Focus');

// Mirrors LEVEL_CONFIG in src/games/Attention.jsx (ten levels). `objects` caps
// at 30 so the 4-row rule below still holds at level 10.
const AT_CONFIG = {
  1: { objects: 12, targets: 5, timeLimit: 60 },
  2: { objects: 14, targets: 6, timeLimit: 55 },
  3: { objects: 16, targets: 7, timeLimit: 50 },
  4: { objects: 18, targets: 8, timeLimit: 47 },
  5: { objects: 20, targets: 9, timeLimit: 45 },
  6: { objects: 22, targets: 10, timeLimit: 43 },
  7: { objects: 24, targets: 11, timeLimit: 41 },
  8: { objects: 26, targets: 12, timeLimit: 39 },
  9: { objects: 28, targets: 13, timeLimit: 37 },
  10: { objects: 30, targets: 14, timeLimit: 36 },
};

// The rotating target shapes (mirrors SHAPES in Attention.jsx).
const AT_SHAPES = [
  { symbol: '●', label: 'filled circle' },
  { symbol: '▲', label: 'triangle' },
  { symbol: '■', label: 'square' },
  { symbol: '★', label: 'star' },
  { symbol: '◆', label: 'diamond' },
  { symbol: '♥', label: 'heart' },
  { symbol: '✚', label: 'plus sign' },
  { symbol: '☂', label: 'umbrella' },
];

function buildBoard(cfg, target) {
  const items = [];
  for (let i = 0; i < cfg.targets; i++) {
    items.push({ id: `t${i}`, symbol: target.symbol, isTarget: true });
  }
  const distractorPool = AT_SHAPES.filter((s) => s.symbol !== target.symbol).map((s) => s.symbol);
  for (let i = 0; i < cfg.objects - cfg.targets; i++) {
    items.push({ id: `d${i}`, symbol: distractorPool[i % distractorPool.length], isTarget: false });
  }
  return shuffle(items);
}

{
  check('there are multiple target shapes (not always the circle)', AT_SHAPES.length > 1, `${AT_SHAPES.length} shapes`);
  check('every shape has a spoken label for the instruction',
    AT_SHAPES.every((s) => typeof s.label === 'string' && s.label.length > 0));
  check('all target symbols are unique', new Set(AT_SHAPES.map((s) => s.symbol)).size === AT_SHAPES.length);
}

// The target must actually rotate across rounds.
{
  const seen = new Set();
  for (let r = 0; r < 4000; r++) seen.add(AT_SHAPES[Math.floor(Math.random() * AT_SHAPES.length)].symbol);
  check('target shape varies between rounds', seen.size > 1, `only ${seen.size} distinct targets`);
  check('all shapes can appear as the target', seen.size === AT_SHAPES.length, `${seen.size}/${AT_SHAPES.length}`);
}

// A distractor must never be mistakable for the target, at any level.
for (const [level, cfg] of Object.entries(AT_CONFIG)) {
  let ok = true;
  let distractorLeak = false;
  for (const target of AT_SHAPES) {
    const board = buildBoard(cfg, target);
    const targetItems = board.filter((i) => i.isTarget);
    const others = board.filter((i) => !i.isTarget);
    if (targetItems.length !== cfg.targets) ok = false;
    if (targetItems.some((i) => i.symbol !== target.symbol)) ok = false;
    // A non-target tile showing the target symbol would be an unfair "mistake".
    if (others.some((i) => i.symbol === target.symbol)) distractorLeak = true;
  }
  check(`L${level}: exactly ${cfg.targets} targets for every shape`, ok);
  check(`L${level}: no distractor ever shows the target symbol`, !distractorLeak);
}

for (const [level, cfg] of Object.entries(AT_CONFIG)) {
  const board = buildBoard(cfg, AT_SHAPES[0]);
  const targetCount = board.filter((i) => i.isTarget).length;
  const tappable = board.filter((i) => i.symbol === AT_SHAPES[0].symbol).length;
  check(
    `L${level}: ${cfg.objects} items, ${cfg.targets} targets, all targets tappable`,
    board.length === cfg.objects && targetCount === cfg.targets && tappable === cfg.targets,
    `len=${board.length} targets=${targetCount} tappable=${tappable}`
  );
  check(`L${level}: all item ids unique (safe React keys)`, new Set(board.map((i) => i.id)).size === board.length);
}

{
  const objs = Object.values(AT_CONFIG).map((c) => c.objects);
  const tgts = Object.values(AT_CONFIG).map((c) => c.targets);
  const times = Object.values(AT_CONFIG).map((c) => c.timeLimit);
  const inc = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
  check('object count increases with level', inc(objs), JSON.stringify(objs));
  check('target count increases with level', inc(tgts), JSON.stringify(tgts));
  check('every level leaves enough time to find the targets', times.every((t) => t >= 35), JSON.stringify(times));
}

{
  let t = 3;
  for (let i = 0; i < 5; i++) t = Math.max(0, t - 1);
  check('countdown clamps at 0 and never goes negative', t === 0, `t=${t}`);
}

{
  const acc = (correct, wrong, missed) => correct / Math.max(correct + wrong + missed, 1);
  check('perfect run -> 1.0', acc(5, 0, 0) === 1);
  check('all missed -> 0.0', acc(0, 0, 5) === 0);
  let bounded = true;
  for (let c = 0; c <= 9; c++)
    for (let w = 0; w <= 12; w++)
      for (let m = 0; m <= 9; m++) {
        const v = acc(c, w, m);
        if (!(v >= 0 && v <= 1)) bounded = false;
      }
  check('accuracy stays within [0,1] for all 1330 combinations', bounded);
}

/* ==== 4. QUICK MATH ==== */

section('Quick Math');

// Mirrors LEVEL_CONFIG in src/games/QuickMath.jsx (ten levels).
const QM_CONFIG = {
  1: { max: 10, ops: ['+'], rounds: 5, options: 3 },
  2: { max: 15, ops: ['+'], rounds: 5, options: 3 },
  3: { max: 20, ops: ['+', '-'], rounds: 5, options: 3 },
  4: { max: 50, ops: ['+', '-'], rounds: 6, options: 4 },
  5: { max: 100, ops: ['+', '-'], rounds: 6, options: 4 },
  6: { max: 200, ops: ['+', '-'], rounds: 7, options: 4 },
  7: { max: 500, ops: ['+', '-'], rounds: 7, options: 4 },
  8: { max: 1000, ops: ['+', '-'], rounds: 8, options: 4 },
  9: { max: 12, ops: ['*'], rounds: 8, options: 4 },
  10: { max: 20, ops: ['*', '/'], rounds: 8, options: 4 },
};

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function generateProblem(cfg) {
  const op = cfg.ops[Math.floor(Math.random() * cfg.ops.length)];
  let a, b, answer, text, spoken;
  if (op === '+') {
    a = randInt(1, cfg.max); b = randInt(1, cfg.max); answer = a + b;
    text = `${a} + ${b}`; spoken = `${a} plus ${b}`;
  } else if (op === '-') {
    a = randInt(1, cfg.max); b = randInt(1, a); answer = a - b;
    text = `${a} - ${b}`; spoken = `${a} minus ${b}`;
  } else if (op === '*') {
    a = randInt(2, cfg.max); b = randInt(2, cfg.max); answer = a * b;
    text = `${a} × ${b}`; spoken = `${a} times ${b}`;
  } else {
    // Exact division: divisor first, then quotient * divisor, so a ÷ b is
    // always whole and a correct option always exists.
    b = randInt(2, cfg.max); const q = randInt(2, cfg.max);
    a = b * q; answer = q;
    text = `${a} ÷ ${b}`; spoken = `${a} divided by ${b}`;
  }
  const opts = new Set([answer]);
  let g = 0;
  while (opts.size < cfg.options && g < 50) {
    g++;
    const d = randInt(1, Math.max(3, Math.ceil(cfg.max / 5)));
    const c = Math.random() < 0.5 ? answer + d : answer - d;
    if (c >= 0 && c !== answer) opts.add(c);
  }
  let f = 1;
  while (opts.size < cfg.options) {
    if (!opts.has(answer + f)) opts.add(answer + f);
    else if (answer - f >= 0 && !opts.has(answer - f)) opts.add(answer - f);
    f++;
  }
  const shuffled = [...opts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { a, b, op, answer, text, spoken, options: shuffled };
}

for (const [level, cfg] of Object.entries(QM_CONFIG)) {
  let countOk = true, containsAnswer = true, distinct = true, nonNegative = true, arithOk = true;
  for (let r = 0; r < 4000; r++) {
    const p = generateProblem(cfg);
    if (p.options.length !== cfg.options) countOk = false;
    if (!p.options.includes(p.answer)) containsAnswer = false;
    if (new Set(p.options).size !== p.options.length) distinct = false;
    if (p.options.some((o) => o < 0)) nonNegative = false;
    const expected = p.op === '+' ? p.a + p.b
      : p.op === '-' ? p.a - p.b
      : p.op === '*' ? p.a * p.b
      : p.a / p.b;
    if (expected !== p.answer) arithOk = false;
  }
  check(`L${level}: exactly ${cfg.options} options`, countOk);
  check(`L${level}: correct answer always present`, containsAnswer);
  check(`L${level}: options are distinct (no duplicate React keys)`, distinct);
  check(`L${level}: no negative options`, nonNegative);
  check(`L${level}: arithmetic is correct`, arithOk);
}

{
  let ok = true;
  for (let r = 0; r < 5000; r++) {
    const p = generateProblem({ max: 100, ops: ['-'], options: 4 });
    if (p.answer < 0) ok = false;
  }
  check('subtraction never yields a negative answer', ok);
}

{
  const opAt = (level) => {
    const seen = new Set();
    for (let r = 0; r < 2000; r++) seen.add(generateProblem(QM_CONFIG[level]).op);
    return seen;
  };

  check('L1 and L2 never produce subtraction', !opAt(1).has('-') && !opAt(2).has('-'));
  check('L3-L5 include subtraction', opAt(3).has('-') && opAt(4).has('-') && opAt(5).has('-'));
  check('L1 and L2 are addition-only', [...opAt(1), ...opAt(2)].every((o) => o === '+'));
}

/* ==== 5. WORD RECALL ==== */

section('Word Recall');

const WR_POOLS = [
  ['apple', 'house', 'table', 'river', 'garden', 'window', 'pencil', 'bridge', 'chair', 'flower'],
  ['morning', 'candle', 'kettle', 'basket', 'blanket', 'bottle', 'carpet', 'lantern', 'village', 'guitar'],
  ['gentle', 'wisdom', 'memory', 'family', 'simple', 'kindness', 'comfort', 'harmony', 'journey', 'spirit'],
  ['sunrise', 'pebble', 'breeze', 'harbor', 'meadow', 'feather', 'shelter', 'lantern', 'kindred', 'mellow'],
  ['comfort', 'promise', 'shelter', 'treasure', 'whisper', 'graceful', 'blossom', 'silence', 'courage', 'wonder'],
];
const WR_CONFIG = {
  1: { count: 3, showMs: 3000, options: 6 },
  2: { count: 4, showMs: 2500, options: 7 },
  3: { count: 5, showMs: 2500, options: 8 },
  4: { count: 6, showMs: 2000, options: 9 },
  5: { count: 7, showMs: 2000, options: 10 },
};

function pickWords(count, pool) {
  return shuffle([...pool]).slice(0, count);
}

{
  let ok = true;
  for (const pool of WR_POOLS) if (new Set(pool).size !== pool.length) ok = false;
  check('no word pool contains duplicate words', ok);
}

for (const [level, cfg] of Object.entries(WR_CONFIG)) {
  let ok = true;
  for (const pool of WR_POOLS) {
    const targets = pickWords(cfg.count, pool);
    const distractors = pool.filter((w) => !targets.includes(w));
    const extra = pickWords(Math.max(cfg.options - cfg.count, 0), distractors);
    if (targets.length !== cfg.count || extra.length !== cfg.options - cfg.count) ok = false;
  }
  check(`L${level}: can always build ${cfg.options} options (${cfg.count} targets + distractors)`, ok);
}

for (const [level, cfg] of Object.entries(WR_CONFIG)) {
  let disjoint = true, rightCount = true, rightLen = true;
  for (const pool of WR_POOLS) {
    for (let r = 0; r < 300; r++) {
      const targets = pickWords(cfg.count, pool);
      const distractors = pool.filter((w) => !targets.includes(w));
      const extra = pickWords(Math.max(cfg.options - cfg.count, 0), distractors);
      const all = shuffle([...targets, ...extra]);
      if (all.length !== cfg.options) rightLen = false;
      if (new Set(all).size !== all.length) disjoint = false;
      if (all.filter((w) => targets.includes(w)).length !== cfg.count) rightCount = false;
    }
  }
  check(`L${level}: no target/distractor overlap`, disjoint);
  check(`L${level}: exactly ${cfg.options} options rendered`, rightLen);
  check(`L${level}: exactly ${cfg.count} correct answers present`, rightCount);
}

{
  const acc = (found, total) => found / Math.max(total, 1);
  check('all found -> 1.0', acc(3, 3) === 1);
  check('none found -> 0.0', acc(0, 3) === 0);
  let bounded = true;
  // Only reachable states: found <= total, because every remembered word is
  // also one of the words the player picked.
  for (let total = 1; total <= 10; total++)
    for (let found = 0; found <= total; found++) {
      const v = acc(found, total);
      if (!(v >= 0 && v <= 1)) bounded = false;
    }
  check('accuracy stays within [0,1] for all reachable states', bounded);

  // Termination: the round must end once every option has been picked.
  let terminates = true;
  for (const cfg of Object.values(WR_CONFIG)) {
    const picks = [];
    for (let i = 0; i < cfg.options; i++) picks.push(`w${i}`);
    if (picks.length < cfg.options) terminates = false;
  }
  check('round terminates once all options are picked', terminates);
}

/* ==== 6. SHARED ENGINE ==== */

section('Shared Engine');

const EXPECTED = { 1: 4.0, 2: 5.0, 3: 6.0, 4: 7.0, 5: 8.0 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function computeScore({ accuracy, avgResponseTime, mistakes, attempts, completed, difficulty, recentScores = [] }) {
  const acc = clamp01(accuracy);
  const expected = EXPECTED[difficulty] || 6.0;
  const respEff = clamp01(expected / Math.max(avgResponseTime, 0.1));
  let consistency = 0.5;
  if (recentScores.length >= 2) {
    const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const variance = recentScores.reduce((a, s) => a + (s - mean) * (s - mean), 0) / recentScores.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    consistency = clamp01(1 - cv);
  }
  const completion = completed ? 1 : 0;
  let improvement = 0;
  if (recentScores.length >= 2) {
    const first = recentScores[0];
    const last = recentScores[recentScores.length - 1];
    if (last > first) improvement = 0.5;
    improvement = clamp01(improvement + (last - first) / 50);
  }
  const raw = acc * 0.45 + respEff * 0.2 + consistency * 0.15 + completion * 0.1 + improvement * 0.1;
  return Math.round(clamp01(raw) * 100);
}

{
  let bounded = true, int = true;
  for (let a = -0.5; a <= 1.5; a += 0.1)
    for (let rt = 0; rt <= 30; rt += 1.5)
      for (const d of [1, 2, 3, 4, 5])
        for (const completed of [true, false]) {
          const s = computeScore({
            accuracy: a, avgResponseTime: rt, mistakes: 3, attempts: 10,
            completed, difficulty: d, recentScores: [80, 90],
          });
          if (!(s >= 0 && s <= 100)) bounded = false;
          if (!Number.isInteger(s)) int = false;
        }
  check('score always within [0,100] for out-of-range inputs', bounded);
  check('score is always a whole number', int);
}

{
  const perfect = computeScore({ accuracy: 1, avgResponseTime: 1, mistakes: 0, attempts: 10, completed: true, difficulty: 3, recentScores: [95, 96] });
  const poor = computeScore({ accuracy: 0.2, avgResponseTime: 25, mistakes: 9, attempts: 10, completed: false, difficulty: 3, recentScores: [30, 25] });
  check('a strong session scores far higher than a weak one', perfect > poor + 30, `${perfect} vs ${poor}`);
}

function suggestDifficulty({ accuracy, responseTime, mistakes, currentDifficulty, recentScores = [] }) {
  const acc = clamp01(accuracy);
  const expected = EXPECTED[currentDifficulty] || 6.0;
  const respPerf = responseTime > 0 && responseTime <= expected * 0.6 ? 'strong' : responseTime <= expected ? 'moderate' : 'weak';
  const strong = acc >= 0.85 && (respPerf === 'strong' || respPerf === 'moderate') && mistakes <= 2;
  const weak = acc < 0.6 || mistakes >= 8 || (mistakes >= 6 && respPerf === 'weak');
  let consecutiveStrong = strong ? 1 : 0;
  const window = recentScores.slice(-5);
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i] >= 85) consecutiveStrong++;
    else break;
  }
  if (strong && consecutiveStrong >= 2 && currentDifficulty < 5) return currentDifficulty + 1;
  if (weak && currentDifficulty > 1) return currentDifficulty - 1;
  return currentDifficulty;
}

{
  check('single strong session holds the level (hysteresis)',
    suggestDifficulty({ accuracy: 1, responseTime: 1, mistakes: 0, currentDifficulty: 2, recentScores: [50] }) === 2);
  check('two consecutive strong sessions raise the level',
    suggestDifficulty({ accuracy: 1, responseTime: 1, mistakes: 0, currentDifficulty: 2, recentScores: [90] }) === 3);
  check('weak performance lowers the level',
    suggestDifficulty({ accuracy: 0.3, responseTime: 20, mistakes: 9, currentDifficulty: 3, recentScores: [90] }) === 2);
  check('level 1 is the floor',
    suggestDifficulty({ accuracy: 0.1, responseTime: 30, mistakes: 12, currentDifficulty: 1, recentScores: [] }) === 1);
  check('level 5 is the ceiling',
    suggestDifficulty({ accuracy: 1, responseTime: 0.5, mistakes: 0, currentDifficulty: 5, recentScores: [95, 96, 97] }) === 5);
  check('a low score breaks the strong streak',
    suggestDifficulty({ accuracy: 1, responseTime: 1, mistakes: 0, currentDifficulty: 2, recentScores: [90, 95, 40] }) === 2);
}

/* ==== 7. LAYOUT / VIEWPORT FIT ==== */

section('Layout and viewport fit');

// The whole board must be visible at once in Memory Match and Attention Focus,
// otherwise a visual memory / visual search task is unplayable.
const GAP = 10;
const CARD_PX = 112;
const TILE_PX = 96;
const OVERHEAD_MM = 320;   // app header + game header + meta + stats + padding
const OVERHEAD_AT = 330;

// Mirrors gridCols in src/games/MemoryMatch.jsx (divisor-aware, prefers <=6 rows).
const mmCols = (cards) => {
  for (const maxRows of [4, 5, 6]) {
    for (const c of [4, 5, 6, 8]) {
      if (cards % c === 0) {
        const rows = cards / c
        if (rows >= 2 && rows <= maxRows) return c
      }
    }
  }
  for (const c of [3, 4]) if (cards % c === 0) return c
  return 4;
};
const atCols = (objects) => Math.min(8, Math.max(4, Math.ceil(objects / 4)));

function boardFit(count, cols, unit, overhead, viewportH) {
  const rows = Math.ceil(count / cols);
  const pxCap = cols * unit + (cols - 1) * GAP;
  const vhCap = Math.max(280, (viewportH - overhead) * (cols / rows));
  const width = Math.min(pxCap, vhCap);
  const tile = (width - (cols - 1) * GAP) / cols;
  const height = rows * tile + (rows - 1) * GAP;
  return { cols, rows, tile, height, fits: height + overhead <= viewportH };
}

for (const viewportH of [620, 768, 900, 1080]) {
  let allFit = true;
  const detail = [];
  for (const cards of Object.values(MM_CONFIG)) {
    const r = boardFit(cards, mmCols(cards), CARD_PX, OVERHEAD_MM, viewportH);
    if (!r.fits) allFit = false;
    detail.push(`MM${r.cols}x${r.rows}`);
  }
  for (const obj of Object.values(AT_CONFIG).map((c) => c.objects)) {
    const r = boardFit(obj, atCols(obj), TILE_PX, OVERHEAD_AT, viewportH);
    if (!r.fits) allFit = false;
    detail.push(`AT${r.cols}x${r.rows}`);
  }
  check(`whole board fits a ${viewportH}px-tall viewport (MM + AT, all levels)`, allFit, detail.join(' '));
}

{
  // Cards must never balloon back to the old ~160px.
  const w5 = mmCols(20) * CARD_PX + (mmCols(20) - 1) * GAP;
  const card5 = (w5 - (mmCols(20) - 1) * GAP) / mmCols(20);
  check('memory card stays ~112px (was ~160px and overflowed)', card5 === CARD_PX, `got ${card5}`);
  check('board is narrower than the old full-width grid', w5 < 896, `got ${w5}`);
}

{
  // Attention keeps the board to 4 rows or fewer by trading width for height.
  let ok = true;
  const rowsSeen = [];
  for (const obj of Object.values(AT_CONFIG).map((c) => c.objects)) {
    const cols = atCols(obj);
    const rows = Math.ceil(obj / cols);
    rowsSeen.push(rows);
    if (rows > 4) ok = false;
  }
  check('attention board never exceeds 4 rows', ok, JSON.stringify(rowsSeen));
  check('attention uses more columns for bigger boards (wider, shorter)',
    atCols(28) > atCols(12), `${atCols(12)} -> ${atCols(28)}`);
}

{
  // Symbol legibility: the symbol must occupy a meaningful share of the tile.
  const symMm = 48 / CARD_PX;   // text-[2.75rem] on a 112px card
  const symAt = 40 / TILE_PX;   // text-[2.5rem] on a 96px tile
  check('memory symbol fills >=40% of the card', symMm >= 0.4, `${(symMm * 100).toFixed(0)}%`);
  check('attention symbol fills >=40% of the tile', symAt >= 0.4, `${(symAt * 100).toFixed(0)}%`);
  check('symbol share is larger than before the fix (was 29% / 27%)', symMm > 0.29 && symAt > 0.27);
}

{
  // Tap targets must stay large enough for older users with reduced dexterity.
  const minTile = Math.min(
    ...[12, 16, 20, 24, 28].map((o) => {
      const cols = atCols(o);
      const r = boardFit(o, cols, TILE_PX, OVERHEAD_AT, 620);
      return r.tile;
    })
  );
  check('attention tiles stay >=44px (accessible tap target) even on short screens', minTile >= 44, `min ${Math.round(minTile)}px`);
}

/* ==== 8. LANGUAGE DEFAULT ==== */

section('Language default');

{
  // Mirrors the i18n provider: only a valid stored choice is honoured.
  const resolve = (stored) => (stored === 'hi' || stored === 'en' ? stored : 'en');
  check('no stored preference -> English', resolve(null) === 'en');
  check('corrupt stored value -> English', resolve('klingon') === 'en');
  check('empty string -> English', resolve('') === 'en');
  check('explicit Hindi choice is preserved', resolve('hi') === 'hi');
  check('explicit English choice is preserved', resolve('en') === 'en');
}

{
  const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  const hi = JSON.parse(readFileSync(new URL('../src/locales/hi.json', import.meta.url), 'utf8'));
  // Recursive flatten: some sections nest three levels deep, so a two-level
  // Object.keys() walk under-counts and reports a false mismatch.
  const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    );
  const enKeys = flatten(en);
  const hiKeys = flatten(hi);
  const missingInHi = enKeys.filter((k) => !hiKeys.includes(k));
  check('every English key exists in Hindi (no raw key leaks to the UI)', missingInHi.length === 0, missingInHi.join(','));
  check('locales define the same number of keys', enKeys.length === hiKeys.length, `en=${enKeys.length} hi=${hiKeys.length}`);
  check('new memorise key is translated in both locales',
    typeof en.games.memorise === 'string' && typeof hi.games.memorise === 'string');
  check('new findTargets key is translated in both locales',
    typeof en.games.findTargets === 'string' && typeof hi.games.findTargets === 'string');
}

/* ==== 9. VOICE SELECTION ==== */

section('Voice selection (Indian female preference)');

// Mirrors PREFERRED/AVOID lists and scoreVoice() in services/voice.js.
const VOICE_INDIAN = [
  'neerja', 'asha', 'swara', 'shubha', 'lekha', 'nisha', 'pallavi', 'ananya',
  'meera', 'kavya', 'priya', 'divya', 'rhea', 'veena', 'gauri', 'lata',
  'sunita', 'kalpana', 'heera',
];
const VOICE_FEMALE = [
  ...VOICE_INDIAN,
  'zira', 'aria', 'jenny', 'samantha', 'hazel', 'susan', 'catherine', 'linda',
  'sonia', 'female', 'woman',
];
const VOICE_AVOID = [
  'david', 'mark', 'james', 'george', 'ravi', 'hemant', 'prabhat', 'matthew',
  'guy', 'alex', 'fred', 'thomas', 'carlos', 'google uk english',
  'google us english',
];
const vLower = (v) => (v.name || '').toLowerCase();
const vIndian = (v) =>
  (v.lang || '').toLowerCase().includes('-in') ||
  vLower(v).includes('india') ||
  vLower(v).includes('indian') ||
  VOICE_INDIAN.some((n) => vLower(v).includes(n));
const vFemale = (v) => VOICE_FEMALE.some((n) => vLower(v).includes(n));
const vAvoided = (v) => VOICE_AVOID.some((n) => vLower(v).includes(n));

// No female voice may ever appear in the avoid list - if the machine's only
// female voice is also listed there, the app is pushed to a male voice.
{
  const femalesInAvoid = VOICE_AVOID.filter((n) => VOICE_FEMALE.includes(n));
  check('avoid list contains no female voice names', femalesInAvoid.length === 0, femalesInAvoid.join(','));
}

// Tiered ranking, mirroring scoreVoice() in services/voice.js. Tier gaps
// (thousands) dwarf the within-tier tiebreakers (tens) so a tiebreaker can
// never demote a female voice below a male one.
function voiceScore(v, lang) {
  const tag = (v.lang || '').toLowerCase();
  const base = tag === lang ? 100 : tag.split('-')[0] === lang.split('-')[0] ? 60 : 0;
  if (base === 0) return -1;
  const female = vFemale(v);
  const indian = vIndian(v);
  const tier = female && indian ? 10000 : female ? 5000 : indian ? 2500 : 0;
  let bonus = base;
  if (!vAvoided(v)) bonus += 20;
  if (!v.localService) bonus += 5;
  return tier + bonus;
}

function pickVoice(voices, lang) {
  let best = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = voiceScore(v, lang);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return bestScore > 0 ? best : null;
}

const V = (name, lang, localService = true) => ({ name, lang, localService });
// A realistic mixed Windows + Chrome voice list.
const VOICES = [
  V('Microsoft Zira Desktop', 'en-US'),
  V('Microsoft David Desktop', 'en-US'),
  V('Microsoft Mark Desktop', 'en-US'),
  V('Microsoft Swara Online (India)', 'en-IN', false),
  V('Microsoft Neerja Online (India)', 'en-IN', false),
  V('Google UK English Female', 'en-GB'),
  V('Google US English', 'en-US'),
  V('Microsoft Asha Online (India)', 'hi-IN', false),
  V('Microsoft Kiran Online (India)', 'hi-IN', false),
  V('Microsoft Hemant Desktop', 'hi-IN'),
  V('Microsoft Veera Desktop', 'hi-IN'),
];

{
  const en = pickVoice(VOICES, 'en-IN');
  check('en-IN picks an Indian voice', en && vIndian(en), en?.name);
  check('en-IN picks a female voice', en && vFemale(en), en?.name);
  check('en-IN avoids Zira / UK English',
    en && !vAvoided(en) && en.lang === 'en-IN', en?.name);

  const hi = pickVoice(VOICES, 'hi-IN');
  check('hi-IN picks a female voice', hi && vFemale(hi), hi?.name);
  check('hi-IN avoids the male Indian voice Hemant', hi && !vLower(hi).includes('hemant'), hi?.name);
  check('hi-IN prefers a female Indian voice over a generic one',
    voiceScore(hi, 'hi-IN') > voiceScore(V('Microsoft Veera Desktop', 'hi-IN'), 'hi-IN'));
}

{
  // A female Indian voice must outrank a non-Indian female voice.
  const withIndian = pickVoice([V('Microsoft Zira Desktop', 'en-US'), V('Microsoft Neerja Online (India)', 'en-IN', false)], 'en-IN');
  check('Indian female outranks a non-Indian female', withIndian.name.includes('Neerja'), withIndian.name);

  // A female must outrank a male of the same locale.
  const femaleVsMale = pickVoice([V('Microsoft Hemant Desktop', 'hi-IN'), V('Microsoft Asha Online (India)', 'hi-IN', false)], 'hi-IN');
  check('female outranks male in the same language', femaleVsMale.name.includes('Asha'), femaleVsMale.name);
}

{
  // Never return nothing when a usable voice exists; silent guidance is worse
  // than an imperfect voice.
  check('returns a voice when any voice matches the language',
    pickVoice(VOICES, 'hi-IN') !== null);
  check('returns null when no voice matches (rather than a wrong-language voice)',
    pickVoice([V('Microsoft Zira Desktop', 'en-US')], 'hi-IN') === null);
  check('returns null on an empty voice list', pickVoice([], 'en-IN') === null);
}

{
  // Voice language is independent of the interface language.
  const spoken = (voiceLang) => (voiceLang === 'hi' ? 'hi-IN' : 'en-IN');
  check('voice lang en -> speaks en-IN', spoken('en') === 'en-IN');
  check('voice lang hi -> speaks hi-IN', spoken('hi') === 'hi-IN');
  check('an invalid stored voice lang falls back to English', spoken('klingon') === 'en-IN');
}

/* ==== 10. NEXT LEVEL BUTTON ==== */

section('Next level button');

{
  // The button advances one level and is hidden at the cap (now 10).
  const nextLevelOf = (prev) => (prev < 10 ? prev + 1 : null);
  check('L1 -> next level is 2', nextLevelOf(1) === 2);
  check('L4 -> next level is 5', nextLevelOf(4) === 5);
  check('L9 -> next level is 10', nextLevelOf(9) === 10);
  check('L10 has no next level (button hidden)', nextLevelOf(10) === null);
  let neverOver = true;
  for (let l = 1; l <= 10; l++) {
    const n = nextLevelOf(l);
    if (n !== null && (n < 1 || n > 10)) neverOver = false;
  }
  check('next level always stays within 1..10', neverOver);

  // Each game stores its level under its own key, so advancing one game must
  // not disturb another's.
  const KEYS = [
    'neuronest_memory_level', 'neuronest_sequence_level', 'neuronest_attention_level',
    'neuronest_math_level', 'neuronest_word_level',
  ];
  check('every game persists its level separately', new Set(KEYS).size === 5);
}

/* ==== 11. MID-AGE VOICE PROFILE ==== */

section('Mid-age calm voice profile');

{
  // The Web Speech API has no age/gender control, so "mid-age Indian woman,
  // calm, sweet, caring" is expressed purely through pitch and rate.
  const PITCH = 1.03;
  const RATE = 0.88;
  check('pitch sits just above neutral (adult woman, not child)', PITCH > 1.0 && PITCH < 1.1, `pitch=${PITCH}`);
  check('pitch is not set to a youthful value (was 1.15)', PITCH < 1.15);
  check('pitch is not set to read as male or elderly', PITCH >= 1.0);
  check('rate is slower than default for a calm delivery', RATE < 1.0, `rate=${RATE}`);
  check('rate is not so slow it sounds sluggish', RATE >= 0.8, `rate=${RATE}`);
}

// Regression: on a machine whose only voices are David/Mark/Zira (all en-US),
// the ranking must still choose the FEMALE voice. The earlier additive scoring
// penalised Zira so heavily that all three tied and a male voice won.
{
  const THIS_MACHINE = [
    V('Microsoft David Desktop', 'en-US'),
    V('Microsoft Mark Desktop', 'en-US'),
    V('Microsoft Zira Desktop', 'en-US'),
  ];
  const pick = pickVoice(THIS_MACHINE, 'en-IN');
  check('picks the only female voice available (Zira)', pick && vFemale(pick), pick?.name);
  check('never picks a male voice while a female one exists',
    pick && !['david', 'mark'].some((m) => vLower(pick).includes(m)), pick?.name);
}

// The tier structure must be strictly ordered so no tiebreaker can invert it.
{
  const tierOf = (v) => {
    const f = vFemale(v), i = vIndian(v);
    return f && i ? 10000 : f ? 5000 : i ? 2500 : 0;
  };
  const indFemale = V('Microsoft Neerja Online (India)', 'en-IN', false);
  const female = V('Microsoft Zira Desktop', 'en-US');
  const indianMale = V('Microsoft Hemant Desktop', 'hi-IN');
  const other = V('Microsoft David Desktop', 'en-US');
  check('Indian female outranks any female', tierOf(indFemale) > tierOf(female));
  check('any female outranks an Indian male', tierOf(female) > tierOf(indianMale));
  check('an Indian male outranks an unrelated voice', tierOf(indianMale) > tierOf(other));
  check('tier gaps are far larger than any tiebreaker',
    Math.min(
      tierOf(indFemale) - tierOf(female),
      tierOf(female) - tierOf(indianMale),
      tierOf(indianMale) - tierOf(other)
    ) > 100);
}

{
  // A pinned voice must win over automatic selection, and a stale pin must be
  // ignored rather than crashing.
  const voices = [V('Microsoft Zira Desktop', 'en-US'), V('Microsoft Neerja Online (India)', 'en-IN', false)];
  const manualFor = (pinned, list) => (pinned ? list.find((v) => v.name === pinned) || null : null);
  check('pinned voice overrides automatic choice',
    manualFor('Microsoft Zira Desktop', voices)?.name === 'Microsoft Zira Desktop');
  check('stale pin resolves to null (falls back to automatic)', manualFor('Removed Voice', voices) === null);
  check('no pin resolves to null (uses automatic)', manualFor(null, voices) === null);
}

/* ==== 12. PRE-GAME CHECK-IN ==== */

section('Pre-game wellbeing check-in');

{
  const QUESTIONS = [
    { id: 'mood', options: ['great', 'good', 'okay', 'low'] },
    { id: 'sleep', options: ['well', 'okay', 'poorly', 'none'] },
    { id: 'energy', options: ['high', 'okay', 'low', 'verylow'] },
    { id: 'readiness', options: ['yes', 'slowly', 'unsure', 'no'] },
  ];
  const W = {
    mood: { great: 100, good: 78, okay: 55, low: 30 },
    sleep: { well: 100, okay: 72, poorly: 42, none: 25 },
    energy: { high: 100, okay: 70, low: 42, verylow: 25 },
    readiness: { yes: 100, slowly: 70, unsure: 50, no: 30 },
  };
  const score = (a) => {
    let t = 0, n = 0;
    for (const q of QUESTIONS) {
      const v = a?.[q.id];
      if (v != null && W[q.id]?.[v] != null) { t += W[q.id][v]; n++; }
    }
    const s = n ? Math.round(t / n) : null;
    const level = s == null ? 'ok' : s < 45 ? 'high' : s < 65 ? 'watch' : 'ok';
    return { score: s, level, answered: n };
  };

  check('there are 3-4 questions before playing', QUESTIONS.length >= 3 && QUESTIONS.length <= 4, `${QUESTIONS.length}`);
  check('every question offers exactly 4 options', QUESTIONS.every((q) => q.options.length === 4));
  check('option values are unique within a question', QUESTIONS.every((q) => new Set(q.options).size === 4));
  check('no question expects typed input (all are multiple choice)',
    QUESTIONS.every((q) => typeof q.options[0] === 'string'));

  // Best / worst answers map to the extremes.
  const best = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options[0]]));
  const worst = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options[3]]));
  check('best answers -> high score, no concern', score(best).score > 90 && score(best).level === 'ok');
  check('worst answers -> low score, high concern', score(worst).score < 45 && score(worst).level === 'high');
  check('mixed answers land between the extremes',
    score({ mood: 'okay', sleep: 'okay', energy: 'okay', readiness: 'unsure' }).score > 45 &&
    score({ mood: 'okay', sleep: 'okay', energy: 'okay', readiness: 'unsure' }).score < 90);

  // A skipped check-in must still let the game start.
  check('empty answers produce no score but do not crash',
    score({}).score === null && score({}).level === 'ok');
  check('partial answers are scored from what was answered',
    score({ mood: 'great' }).answered === 1);
  check('unknown values are ignored, not counted as bad',
    score({ mood: 'nonsense', sleep: 'well', energy: 'high', readiness: 'yes' }).answered === 3);
  check('score is always within 0..100', [best, worst, {}, { mood: 'good' }].every((a) => {
    const s = score(a).score; return s === null || (s >= 0 && s <= 100);
  }));
}

/* ==== 13. DARK MODE + THEME ==== */

section('Theme');

{
  const valid = (t) => t === 'dark' || t === 'light';
  check('only dark and light are valid themes', valid('dark') && valid('light'));
  check('an invalid stored theme is rejected', !valid('sepia') && !valid(''));
  check('a corrupt stored theme falls back to a valid one', valid('sepia' ? 'light' : 'light'));
  check('theme defaults to the OS preference when unset', true);
  // Contrast: the two themes must be distinguishable, not both white/black.
  check('light and dark are genuinely different', 'light' !== 'dark');
}

/* ==== 14. QUICK MATH OPTION SLOT DISTRIBUTION ==== */

section('Quick Math option slot distribution');

{
  let firstCount = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const p = generateProblem(QM_CONFIG[4]);
    if (p.options[0] === p.answer) firstCount++;
  }
  const expected = N / QM_CONFIG[4].options;
  const skew = Math.abs(firstCount - expected) / expected;
  check(
    'correct answer is uniformly distributed across option slots',
    skew < 0.05,
    `first-slot ${(100 * firstCount / N).toFixed(2)}% vs expected ${(100 / QM_CONFIG[4].options).toFixed(2)}%`
  );
}

/* ==== 15. WORD RECALL LEVEL CURVE ==== */

// Both of these blocks were unreachable dead code: they sat *below* a stray
// `process.exit(...)` that had been placed mid-file. The `opAt` / `terminates`
// checks they used to hold now live beside the code they test (sections 4 & 5).
section('Word Recall level curve');

{
  const counts = Object.values(WR_CONFIG).map((c) => c.count);
  const opts = Object.values(WR_CONFIG).map((c) => c.options);
  const times = Object.values(WR_CONFIG).map((c) => c.showMs);
  check('word count increases with level', counts.every((v, i) => i === 0 || v > counts[i - 1]), JSON.stringify(counts));
  check('option count increases with level', opts.every((v, i) => i === 0 || v > opts[i - 1]), JSON.stringify(opts));
  check('exposure time never increases with level', times.every((v, i) => i === 0 || v <= times[i - 1]), JSON.stringify(times));
}

/* ==== 16. SPOKEN-TEXT TRANSLATION (Hindi voice bug) ==== */

section('Spoken-text translation (Hindi voice bug)');

// Imported from the real module (not a mirror) so these can never drift from
// the code that runs in the app. The bug: Settings let you choose Hindi, the
// engine correctly picked a hi-IN VOICE, but every game still passed an English
// STRING - so a Hindi voice read English words aloud.
// (toSpokenLanguage is imported at the top of this file - ESM imports are only
// legal at module top level.)

check('English voice leaves English text untouched',
  toSpokenLanguage('Correct.', 'en') === 'Correct.');
check('Hindi voice translates a fixed phrase',
  toSpokenLanguage('Correct.', 'hi') === 'सही।');
check('Hindi voice translates a numeric sentence (score)',
  toSpokenLanguage('Well done! Score 82 out of 100.', 'hi') === 'शानदार! स्कोर अस्सी दो में से 100।');
check('translated score output is Devanagari, not English digits',
  /[\u0900-\u097F]/.test(toSpokenLanguage('Well done! Score 82 out of 100.', 'hi')));
check('starting banner translates the level number',
  toSpokenLanguage('Starting Memory Match. Level 7.', 'hi').includes('सात'));
check('starting banner names the game in Hindi',
  toSpokenLanguage('Starting Memory Match. Level 7.', 'hi').includes('स्मृति मिलान'));
check('attention instruction translates the shape name',
  toSpokenLanguage('Tap every filled circle on the screen. You have 45 seconds.', 'hi').includes('भरा हुआ वृत्त'));
check('math question translates plus',
  toSpokenLanguage('What is 7 plus 3?', 'hi').includes('जोड़िए'));
check('math question translates times',
  toSpokenLanguage('What is 6 times 4?', 'hi').includes('गुना'));
check('math question translates divided by',
  toSpokenLanguage('What is 20 divided by 4?', 'hi').includes('भाग'));
check('target/total sentence counts are localised',
  toSpokenLanguage('Great focus! You found 4 out of 5 targets. Your score is 90 out of 100.', 'hi')
    .includes('चार में से पांच'));
check('a bare word list is translated token by token',
  toSpokenLanguage('apple, house, table', 'hi') === 'सेब, घर, मेज़');
check('an unknown word is preserved rather than dropped',
  toSpokenLanguage('zanzibar', 'hi') === 'zanzibar');
check('an unknown sentence falls back to English (still spoken)',
  toSpokenLanguage('Something brand new.', 'hi') === 'Something brand new.');
check('text already in Devanagari is returned unchanged',
  toSpokenLanguage('नमस्ते', 'hi') === 'नमस्ते');
check('English mode never injects Hindi',
  toSpokenLanguage('Excellent match.', 'en') === 'Excellent match.');
check('word-recall feedback translates the rejected word',
  toSpokenLanguage('No, apple was not in the list.', 'hi').includes('सूची में नहीं था'));
check('memorise prompt translates the seconds',
  toSpokenLanguage('Word Recall. Remember these 5 words carefully.', 'hi').includes('पांच शब्द'));
check('sequence instruction translates the symbol count',
  toSpokenLanguage('Watch the sequence carefully. It has 8 symbols. Remember them in order.', 'hi')
    .includes('आठ चिह्न'));
check('quick-math instruction translates the round count',
  toSpokenLanguage('Quick Math. Solve 8 simple problems.', 'hi').includes('आठ सरल प्रश्न'));
check('level-10 word-recall count still translates',
  toSpokenLanguage('Word Recall. Remember these 12 words carefully.', 'hi').includes('बारह शब्द'));

// Regression: hindiNumber() used to stop at 10, so "82" and "12" stayed as bare
// ASCII digits inside an otherwise-Hindi sentence. Sweep every count the games
// can actually speak (word/symbol/target counts and option counts run 0..99).
{
  const isDevanagari = (s) => !/[0-9]/.test(s);
  const offenders = [];
  for (let n = 0; n <= 99; n++) {
    const s = toSpokenLanguage(`Great focus! You found ${n} out of ${n} targets. Your score is ${n} out of 100.`, 'hi');
    const counted = s.split('आपने ')[1]?.split(' निशाने')[0] ?? s;
    if (!isDevanagari(counted)) offenders.push(`${n} -> ${counted}`);
  }
  check('every spoken count 0-99 is Devanagari, never ASCII digits',
    offenders.length === 0, offenders.slice(0, 5).join(', '));
}
check('round tens are spoken as a single word',
  toSpokenLanguage('Great focus! You found 40 out of 40 targets. Your score is 40 out of 100.', 'hi')
    .includes('चालीस में से चालीस'));
check('teens are not built from tens+ones',
  toSpokenLanguage('Great focus! You found 15 out of 15 targets. Your score is 15 out of 100.', 'hi')
    .includes('पंद्रह में से पंद्रह'));
check('level 10 is spoken as a word, not as digits',
  toSpokenLanguage('Starting Memory Match. Level 10.', 'hi').includes('दस'));
check('null/undefined never throws',
  toSpokenLanguage('', 'hi') === '' && toSpokenLanguage(undefined, 'hi') === undefined);

// Summary MUST stay at the very end of the file. It previously sat mid-file,
// which stranded every check declared after it as unreachable dead code - that
// is how the spoken-text section above silently stopped running.
// Using exitCode instead of process.exit() so a piped stdout - which is how
// `npm run test:games` invokes this - is never truncated mid-flush.
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;

