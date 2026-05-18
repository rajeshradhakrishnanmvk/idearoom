// ============================================================================
// Bibliotheca — Application Module
// Zero dependencies. Vanilla JS. TDD-first per constitution.
// ============================================================================

// ── Test Harness ───────────────────────────────────────────────────────────
const testResults = [];
let testPassCount = 0;
let testFailCount = 0;

/**
 * Assert that a condition is true.
 * @param {boolean} condition - The condition to check
 * @param {string} description - Human-readable test description
 */
export function assert(condition, description) {
  const passed = Boolean(condition);
  if (passed) {
    testPassCount++;
    testResults.push({ description, passed: true });
  } else {
    testFailCount++;
    testResults.push({ description, passed: false });
  }
  renderTestHarness();
}

/**
 * Assert that actual equals expected (loose equality).
 * @param {*} actual - The actual value
 * @param {*} expected - The expected value
 * @param {string} description - Human-readable test description
 */
export function assertEqual(actual, expected, description) {
  const passed = actual === expected;
  if (passed) {
    testPassCount++;
    testResults.push({ description, passed: true });
  } else {
    testFailCount++;
    testResults.push({
      description,
      passed: false,
      detail: `Expected: ${JSON.stringify(expected)}\nReceived: ${JSON.stringify(actual)}`
    });
  }
  renderTestHarness();
}

/**
 * Render the test harness summary and result list.
 */
function renderTestHarness() {
  const passEl = document.getElementById('test-pass-count');
  const failEl = document.getElementById('test-fail-count');
  const totalEl = document.getElementById('test-total-count');
  const resultsEl = document.getElementById('test-results');

  if (!passEl || !failEl || !totalEl || !resultsEl) return;

  const total = testPassCount + testFailCount;
  passEl.textContent = `${testPassCount} passed`;
  failEl.textContent = `${testFailCount} failed`;
  totalEl.textContent = `${total} total`;

  resultsEl.innerHTML = testResults.map((r, i) => `
    <li class="test-result ${r.passed ? 'test-result--pass' : 'test-result--fail'}">
      ${r.passed ? '✓' : '✗'} ${r.description}
      ${!r.passed && r.detail ? `<div class="test-detail">${r.detail.replace(/\n/g, '<br>')}</div>` : ''}
    </li>
  `).join('');
}

// ── Initialization ─────────────────────────────────────────────────────────
console.log('Bibliotheca app.js loaded. Test harness ready.');
console.log('No tests running yet — awaiting Phase 2 (T006-T008) implementation.');
