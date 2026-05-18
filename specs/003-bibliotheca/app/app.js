// ============================================================================
// Bibliotheca — Application Module
// Zero dependencies. Vanilla JS. TDD-first per constitution.
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════════
// TEST HARNESS (T005)
// ═══════════════════════════════════════════════════════════════════════════

const testResults = [];
let testPassCount = 0;
let testFailCount = 0;

export function assert(condition, description) {
  const passed = Boolean(condition);
  if (passed) { testPassCount++; testResults.push({ description, passed: true }); }
  else { testFailCount++; testResults.push({ description, passed: false }); }
  renderTestHarness();
}

export function assertEqual(actual, expected, description) {
  const passed = actual === expected;
  if (passed) { testPassCount++; testResults.push({ description, passed: true }); }
  else {
    testFailCount++;
    testResults.push({ description, passed: false,
      detail: `Expected: ${JSON.stringify(expected)}\nReceived: ${JSON.stringify(actual)}` });
  }
  renderTestHarness();
}

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
  resultsEl.innerHTML = testResults.map((r, i) =>
    `<li class="test-result ${r.passed ? 'test-result--pass' : 'test-result--fail'}">
      ${r.passed ? '✓' : '✗'} ${r.description}
      ${!r.passed && r.detail ? `<div class="test-detail">${r.detail.replace(/\n/g, '<br>')}</div>` : ''}
    </li>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS (T008) — implementation before state manager (no deps)
// ═══════════════════════════════════════════════════════════════════════════

/** Escape HTML special characters to prevent XSS. */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/** Create a debounced version of a function. */
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Format ISO date string to readable format. Returns '—' for empty/missing. */
export function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return '—'; }
}

/** Calculate percentage complete, clamped 0-100. Returns 0 if total is 0. */
export function percentComplete(current, total) {
  if (total <= 0 || current < 0) return 0;
  if (current >= total) return 100;
  return Math.round((current / total) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCALSTORAGE SCHEMA (T006)
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'bibliotheca-v1';

/**
 * Load books from localStorage. Returns:
 * - Parsed array on success
 * - null if no data exists (first run)
 * - Throws descriptive error on corruption
 */
export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Stored data is not an array');
    return parsed;
  } catch (e) {
    if (e.name === 'SyntaxError') {
      throw new Error('Library data is corrupted. JSON parse failed: ' + e.message);
    }
    throw e;
  }
}

/**
 * Save books to localStorage. Handles QuotaExceededError.
 * Returns { success: true } or { success: false, error: string }.
 */
export function saveToStorage(books) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
    return { success: true };
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      return { success: false, error: 'Storage quota exceeded. Your changes could not be saved.' };
    }
    return { success: false, error: e.message };
  }
}

/** Clear all library data from localStorage. */
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Check if storage has existing data. */
export function hasStoredData() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGER (T007)
// ═══════════════════════════════════════════════════════════════════════════

let _books = [];

/** Load books: prefer localStorage, fall back to null (caller loads mock data). */
export function loadBooks() {
  try {
    const stored = loadFromStorage();
    if (stored !== null) {
      _books = stored;
      return stored;
    }
  } catch (e) {
    console.warn('Storage load failed, resetting:', e.message);
    clearStorage();
  }
  _books = [];
  return null;
}

/** Save current state to localStorage. */
export function saveBooks(books) {
  _books = books || _books;
  return saveToStorage(_books);
}

/** Get a single book by ID. */
export function getBook(id) {
  return _books.find(b => b.id === id) || null;
}

/** Update a book's fields (shallow merge). Returns updated book or null. */
export function updateBook(id, patch) {
  const idx = _books.findIndex(b => b.id === id);
  if (idx === -1) return null;
  _books[idx] = { ..._books[idx], ...patch };
  saveToStorage(_books);
  return _books[idx];
}

/** Add a new book after validation. Returns { book, error }. */
export function addBook(book) {
  // Validate required fields
  if (!book || !book.title || !book.title.trim()) {
    return { book: null, error: 'Title is required.' };
  }
  if (!book.author || !book.author.trim()) {
    return { book: null, error: 'Author is required.' };
  }
  if (!book.totalPages || book.totalPages < 1 || !Number.isInteger(book.totalPages)) {
    return { book: null, error: 'Total pages must be a positive integer.' };
  }

  const newBook = {
    id: crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10),
    title: book.title.trim(),
    author: book.author.trim(),
    language: book.language || 'English',
    genre: book.genre || 'Fiction',
    totalPages: book.totalPages,
    currentPage: book.currentPage || 0,
    status: book.status || 'unread'
  };

  _books.push(newBook);
  saveToStorage(_books);
  return { book: newBook, error: null };
}

/** Remove a book by ID. Returns true if removed, false if not found. */
export function removeBook(id) {
  const idx = _books.findIndex(b => b.id === id);
  if (idx === -1) return false;
  _books.splice(idx, 1);
  saveToStorage(_books);
  return true;
}

/** Get all books (current state). */
export function getAllBooks() {
  return [..._books];
}

/** Initialize with provided books (for mock data seeding). */
export function initBooks(books) {
  _books = books;
  saveToStorage(_books);
  return _books;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOK CARD RENDERER (T009)
// ═══════════════════════════════════════════════════════════════════════════

const LANGS = { Malayalam: '🇮🇳', English: '🇬🇧' };
const STATUS_LABELS = { unread: 'Unread', reading: 'Reading', read: 'Read' };
const STATUS_ICONS = { unread: '📖', reading: '📘', read: '✅' };

/** Create a single book card DOM element. */
export function createCardElement(book) {
  const card = document.createElement('article');
  card.className = 'book-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${book.title} by ${book.author}`);
  card.dataset.bookId = book.id;

  const langClass = book.language === 'Malayalam' ? 'ml' : 'en';
  const statusClass = book.status || 'unread';
  const progress = percentComplete(book.currentPage || 0, book.totalPages || 1);
  const langFlag = LANGS[book.language] || '';
  const statusIcon = STATUS_ICONS[book.status] || STATUS_ICONS.unread;
  const statusLabel = STATUS_LABELS[book.status] || 'Unread';

  card.innerHTML = `
    <div class="book-card-accent book-card-accent--${langClass}"></div>
    <div class="book-card-body">
      <h3 class="book-card-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h3>
      <p class="book-card-author" title="${escapeHtml(book.author)}">${escapeHtml(book.author)}</p>
      <div class="book-card-meta">
        <span class="book-card-badge badge-lang badge-lang--${langClass}" aria-label="Language: ${book.language}">
          ${langFlag} ${book.language === 'Malayalam' ? 'ML' : 'EN'}
        </span>
        <span class="book-card-badge badge-genre">${escapeHtml(book.genre || 'Fiction')}</span>
      </div>
      <div class="book-card-footer">
        <span class="book-card-pages">${book.totalPages || '?'} pages</span>
        <button class="book-card-status status--${statusClass}" aria-label="Status: ${statusLabel}. Click to change." type="button">
          ${statusIcon} ${statusLabel}
        </button>
        <button class="book-card-delete" aria-label="Delete ${escapeHtml(book.title)}" type="button" title="Delete book">🗑</button>
      </div>
      <div class="book-card-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${progress}% complete">
        <div class="book-card-progress-fill" style="width:${progress}%"></div>
      </div>
    </div>
  `;

  return card;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOK LIST RENDERER (T010)
// ═══════════════════════════════════════════════════════════════════════════

/** Render a list of books into the grid. Handles empty state. */
export function renderBookList(books) {
  const grid = document.getElementById('book-grid');
  const emptyState = document.getElementById('empty-state');

  if (!grid) return;

  grid.innerHTML = '';

  if (!books || books.length === 0) {
    grid.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.querySelector('.empty-message').textContent =
        'No books found. Try adjusting your search or filters.';
    }
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  books.forEach(book => fragment.appendChild(createCardElement(book)));
  grid.appendChild(fragment);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH ENGINE (T011)
// ═══════════════════════════════════════════════════════════════════════════

/** Filter books by search query (title + author, case-insensitive). */
export function searchBooks(query, books) {
  if (!query || !query.trim()) return books;
  const q = query.toLowerCase().trim();
  return books.filter(b =>
    b.title.toLowerCase().includes(q) ||
    b.author.toLowerCase().includes(q)
  );
}

// ── Shared UI state ─────────────────────────────────────────────────────────
let _currentFilter = 'all';
let _currentQuery = '';

/** Return books filtered by current status filter + search query. */
function getFilteredBooks() {
  let books = getAllBooks();
  if (_currentFilter !== 'all') {
    books = books.filter(b => b.status === _currentFilter);
  }
  return searchBooks(_currentQuery, books);
}

/** Wire up search input with debounce. */
function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  if (!input) return;

  const handleSearch = debounce(() => {
    _currentQuery = input.value;
    clearBtn.hidden = !_currentQuery;
    renderBookList(getFilteredBooks());
    updateStats(getFilteredBooks().length);
  }, 200);

  input.addEventListener('input', handleSearch);

  clearBtn.addEventListener('click', () => {
    input.value = '';
    _currentQuery = '';
    clearBtn.hidden = true;
    renderBookList(getFilteredBooks());
    updateStats(getFilteredBooks().length);
    input.focus();
  });

  // ESC key clears search
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      _currentQuery = '';
      clearBtn.hidden = true;
      renderBookList(getFilteredBooks());
      updateStats(getFilteredBooks().length);
    }
  });
}

// ── Filter bar ───────────────────────────────────────────────────────────────
function setupFilters() {
  const filterBar = document.querySelector('.filter-bar');
  if (!filterBar) return;

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    _currentFilter = btn.dataset.filter;

    filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('filter-btn--active'));
    btn.classList.add('filter-btn--active');

    renderBookList(getFilteredBooks());
    updateStats(getFilteredBooks().length);
  });
}

// ── Card actions (status cycle + delete) ────────────────────────────────────
const STATUS_CYCLE = { unread: 'reading', reading: 'read', read: 'unread' };

function setupCardActions() {
  const grid = document.getElementById('book-grid');
  if (!grid) return;

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if (!card) return;
    const id = card.dataset.bookId;

    if (e.target.closest('.book-card-status')) {
      const book = getBook(id);
      if (!book) return;
      const nextStatus = STATUS_CYCLE[book.status] || 'unread';
      updateBook(id, { status: nextStatus });
      renderBookList(getFilteredBooks());
      updateStats(getFilteredBooks().length);
    }

    if (e.target.closest('.book-card-delete')) {
      const book = getBook(id);
      if (!book) return;
      if (window.confirm(`Delete "${book.title}"?`)) {
        removeBook(id);
        renderBookList(getFilteredBooks());
        updateStats(getFilteredBooks().length);
      }
    }
  });
}

// ── Theme toggle ─────────────────────────────────────────────────────────────
function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const saved = localStorage.getItem('bibliotheca-theme') || 'light';
  document.documentElement.dataset.theme = saved;
  _applyThemeButton(btn, saved);

  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('bibliotheca-theme', next);
    _applyThemeButton(btn, next);
  });
}

function _applyThemeButton(btn, theme) {
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

// ── Add Book dialog ───────────────────────────────────────────────────────────
function setupAddBook() {
  const fab = document.getElementById('add-book-btn');
  const dialog = document.getElementById('add-book-dialog');
  const form = document.getElementById('add-book-form');
  const cancelBtn = document.getElementById('add-book-cancel');
  const errorEl = document.getElementById('add-book-error');
  if (!fab || !dialog || !form) return;

  fab.addEventListener('click', () => {
    form.reset();
    errorEl.hidden = true;
    dialog.showModal();
    document.getElementById('form-title').focus();
  });

  cancelBtn.addEventListener('click', () => {
    dialog.close();
  });

  dialog.addEventListener('click', (e) => {
    // Close on backdrop click
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const totalPagesRaw = parseInt(form.totalPages.value, 10);
    const { book, error } = addBook({
      title: form.title.value,
      author: form.author.value,
      language: form.language.value,
      genre: form.genre.value || 'Fiction',
      totalPages: totalPagesRaw,
      currentPage: 0,
      status: 'unread'
    });

    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      return;
    }

    dialog.close();
    _currentFilter = 'all';
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('filter-btn--active'));
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('filter-btn--active');
    renderBookList(getFilteredBooks());
    updateStats(getFilteredBooks().length);
  });
}

function runAllTests() {
  console.log('🧪 Running Bibliotheca TDD test suite…');

  // ── T008: Utility Helpers ───────────────────────────────────────────
  testEscapeHtml();
  testDebounce();
  testFormatDate();
  testPercentComplete();

  // ── T006: localStorage Schema ───────────────────────────────────────
  testStorageRoundTrip();
  testStorageNullOnEmpty();
  testStorageCorruptionRecovery();

  // ── T007: State Manager ─────────────────────────────────────────────
  testLoadSaveBooks();
  testGetBook();
  testUpdateBook();
  testAddBook();
  testRemoveBook();
  testAddBookValidation();

  // ── T009: Book Card Renderer ────────────────────────────────────────
  testCreateCardElement();
  testCreateCardMissingFields();

  // ── T010: Book List Renderer ────────────────────────────────────────
  testRenderBookList();
  testRenderEmptyList();

  // ── T011: Search Engine ─────────────────────────────────────────────
  testSearchByTitle();
  testSearchByAuthor();
  testSearchCaseInsensitive();
  testSearchNoMatch();
  testSearchEmptyQuery();
  testSearchMalayalam();

  console.log(`✅ Test suite complete: ${testPassCount} passed, ${testFailCount} failed`);
}

// ── T008 Tests ────────────────────────────────────────────────────────────

function testEscapeHtml() {
  assertEqual(escapeHtml('<script>alert("XSS")</script>'),
    '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
    'T008: escapeHtml escapes script tags and quotes');
  assertEqual(escapeHtml('Hello & World'),
    'Hello &amp; World',
    'T008: escapeHtml escapes ampersand');
  assertEqual(escapeHtml("it's a test"),
    'it&#39;s a test',
    'T008: escapeHtml escapes single quote');
  assertEqual(escapeHtml(''), '', 'T008: escapeHtml handles empty string');
  assertEqual(escapeHtml(null), '', 'T008: escapeHtml handles null (returns empty)');
  assertEqual(escapeHtml(undefined), '', 'T008: escapeHtml handles undefined');
  assertEqual(escapeHtml('No special chars'), 'No special chars',
    'T008: escapeHtml passes through safe strings');
}

function testDebounce() {
  return new Promise(resolve => {
    let calls = 0;
    const fn = debounce(() => { calls++; }, 50);
    fn(); fn(); fn();
    assertEqual(calls, 0, 'T008: debounce does not call immediately');
    setTimeout(() => {
      assertEqual(calls, 1, 'T008: debounce calls once after timeout');
      resolve();
    }, 100);
  });
}

function testFormatDate() {
  assertEqual(formatDate(null), '—', 'T008: formatDate returns — for null');
  assertEqual(formatDate(''), '—', 'T008: formatDate returns — for empty string');
  assertEqual(formatDate('invalid'), '—', 'T008: formatDate returns — for invalid date');
  const result = formatDate('2026-05-18');
  assert(result.includes('2026'), 'T008: formatDate includes year');
  assert(result.includes('May'), 'T008: formatDate includes month name');
}

function testPercentComplete() {
  assertEqual(percentComplete(50, 100), 50, 'T008: percentComplete 50/100 = 50%');
  assertEqual(percentComplete(0, 100), 0, 'T008: percentComplete 0/100 = 0%');
  assertEqual(percentComplete(100, 100), 100, 'T008: percentComplete 100/100 = 100%');
  assertEqual(percentComplete(0, 0), 0, 'T008: percentComplete 0/0 returns 0');
  assertEqual(percentComplete(-5, 100), 0, 'T008: percentComplete negative current returns 0');
  assertEqual(percentComplete(150, 100), 100, 'T008: percentComplete over 100% clamps to 100');
  assertEqual(percentComplete(25, 200), 13, 'T008: percentComplete 25/200 = 13%');
}

// ── T006 Tests ────────────────────────────────────────────────────────────

function testStorageRoundTrip() {
  clearStorage();
  const testData = [{ id: 't1', title: 'Test Book', author: 'Tester', language: 'English', genre: 'Fiction', totalPages: 100, currentPage: 0, status: 'unread' }];
  const result = saveToStorage(testData);
  assert(result.success, 'T006: saveToStorage returns success');
  const loaded = loadFromStorage();
  assert(loaded !== null, 'T006: loadFromStorage returns data after save');
  assertEqual(loaded.length, 1, 'T006: loadFromStorage returns correct count');
  assertEqual(loaded[0].title, 'Test Book', 'T006: loadFromStorage preserves book title');
  clearStorage();
}

function testStorageNullOnEmpty() {
  clearStorage();
  const loaded = loadFromStorage();
  assertEqual(loaded, null, 'T006: loadFromStorage returns null when no data exists');
}

function testStorageCorruptionRecovery() {
  clearStorage();
  localStorage.setItem(STORAGE_KEY, 'not valid json{{{');
  let threw = false;
  try {
    loadFromStorage();
  } catch (e) {
    threw = true;
    assert(e.message.includes('corrupted'), 'T006: loadFromStorage throws on corrupted JSON');
  }
  assert(threw, 'T006: loadFromStorage throws error on corrupted data');
  clearStorage();

  // Non-array data
  localStorage.setItem(STORAGE_KEY, '"just a string"');
  threw = false;
  try {
    loadFromStorage();
  } catch (e) {
    threw = true;
  }
  assert(threw, 'T006: loadFromStorage throws on non-array stored data');
  clearStorage();
}

// ── T007 Tests ────────────────────────────────────────────────────────────

function testLoadSaveBooks() {
  clearStorage();
  const mock = [
    { id: 'b1', title: 'Book One', author: 'A1', language: 'English', genre: 'Fiction', totalPages: 200, currentPage: 0, status: 'unread' },
    { id: 'b2', title: 'Book Two', author: 'A2', language: 'Malayalam', genre: 'Fiction', totalPages: 150, currentPage: 50, status: 'reading' }
  ];
  initBooks(mock);
  assertEqual(getAllBooks().length, 2, 'T007: initBooks seeds 2 books');
  const loaded = loadBooks();
  assertEqual(loaded.length, 2, 'T007: loadBooks returns 2 books from storage');
}

function testGetBook() {
  const book = getBook('b1');
  assert(book !== null, 'T007: getBook finds existing book');
  assertEqual(book.title, 'Book One', 'T007: getBook returns correct book');
  assertEqual(getBook('nonexistent'), null, 'T007: getBook returns null for missing ID');
}

function testUpdateBook() {
  const updated = updateBook('b1', { title: 'Book One Updated', currentPage: 100, status: 'reading' });
  assertEqual(updated.title, 'Book One Updated', 'T007: updateBook changes title');
  assertEqual(updated.currentPage, 100, 'T007: updateBook changes currentPage');
  assertEqual(updated.status, 'reading', 'T007: updateBook changes status');
  assertEqual(updated.author, 'A1', 'T007: updateBook preserves unchanged fields');
  assertEqual(updateBook('fake', {}), null, 'T007: updateBook returns null for unknown ID');
}

function testAddBook() {
  const { book, error } = addBook({
    title: 'New Book', author: 'New Author',
    language: 'English', genre: 'Sci-Fi', totalPages: 300
  });
  assert(error === null, 'T007: addBook succeeds with valid data');
  assert(book !== null, 'T007: addBook returns book object');
  assertEqual(book.title, 'New Book', 'T007: addBook preserves title');
  assertEqual(book.totalPages, 300, 'T007: addBook preserves totalPages');
  assertEqual(book.status, 'unread', 'T007: addBook defaults status to unread');
  assert(book.id && book.id.length === 8, 'T007: addBook generates 8-char ID');
  assertEqual(getAllBooks().length, 3, 'T007: addBook increases book count');
}

function testRemoveBook() {
  const removed = removeBook('b2');
  assert(removed, 'T007: removeBook returns true for existing book');
  assertEqual(getAllBooks().length, 2, 'T007: removeBook decreases count');
  assertEqual(removeBook('b2'), false, 'T007: removeBook returns false for already-removed');
  assertEqual(removeBook('nonexistent'), false, 'T007: removeBook returns false for unknown ID');
}

function testAddBookValidation() {
  // Missing title
  const r1 = addBook({ author: 'X', totalPages: 100 });
  assert(r1.error !== null, 'T007: addBook rejects missing title');
  assert(r1.book === null, 'T007: addBook returns null book on validation error');

  // Missing author
  const r2 = addBook({ title: 'Y', totalPages: 100 });
  assert(r2.error !== null, 'T007: addBook rejects missing author');

  // Missing totalPages
  const r3 = addBook({ title: 'Z', author: 'W' });
  assert(r3.error !== null, 'T007: addBook rejects missing totalPages');

  // Negative pages
  const r4 = addBook({ title: 'Z', author: 'W', totalPages: -5 });
  assert(r4.error !== null, 'T007: addBook rejects negative totalPages');

  // Zero pages
  const r5 = addBook({ title: 'Z', author: 'W', totalPages: 0 });
  assert(r5.error !== null, 'T007: addBook rejects zero totalPages');

  // Empty title (whitespace only)
  const r6 = addBook({ title: '   ', author: 'W', totalPages: 100 });
  assert(r6.error !== null, 'T007: addBook rejects whitespace-only title');
}

// ── T009 Tests ────────────────────────────────────────────────────────────

function testCreateCardElement() {
  const book = { id: 'test1', title: 'Test Book', author: 'Test Author',
    language: 'English', genre: 'Fiction', totalPages: 200, currentPage: 50, status: 'reading' };
  const card = createCardElement(book);
  assert(card instanceof HTMLElement, 'T009: createCardElement returns HTMLElement');
  assert(card.classList.contains('book-card'), 'T009: card has book-card class');
  assert(card.dataset.bookId === 'test1', 'T009: card has data-book-id');
  assert(card.querySelector('.book-card-title').textContent.includes('Test Book'),
    'T009: card shows title');
  assert(card.querySelector('.book-card-author').textContent.includes('Test Author'),
    'T009: card shows author');
  assert(card.querySelector('.badge-lang--en'), 'T009: English book has EN badge class');
  assert(card.querySelector('.status--reading'), 'T009: reading book has reading status class');
  assert(card.querySelector('.book-card-progress'), 'T009: card has progress bar');
}

function testCreateCardMissingFields() {
  const minimal = { id: 'min', title: 'Min', author: 'Min', language: 'English',
    genre: '', totalPages: null, currentPage: 0, status: 'unread' };
  const card = createCardElement(minimal);
  assert(card instanceof HTMLElement, 'T009: createCardElement handles minimal book');
  assert(card.querySelector('.book-card-title'), 'T009: minimal card has title');
  assert(card.querySelector('.status--unread'), 'T009: minimal card defaults to unread status');
}

// ── T010 Tests ────────────────────────────────────────────────────────────

function testRenderBookList() {
  const books = [
    { id: 'r1', title: 'R1', author: 'A1', language: 'English', genre: 'Fiction', totalPages: 100, currentPage: 0, status: 'unread' },
    { id: 'r2', title: 'R2', author: 'A2', language: 'Malayalam', genre: 'Fiction', totalPages: 200, currentPage: 50, status: 'reading' }
  ];
  renderBookList(books);
  const grid = document.getElementById('book-grid');
  const cards = grid.querySelectorAll('.book-card');
  assertEqual(cards.length, 2, 'T010: renderBookList renders correct number of cards');
  assert(!document.getElementById('empty-state').hidden, false, 'T010: empty state is hidden when books exist');
}

function testRenderEmptyList() {
  renderBookList([]);
  const grid = document.getElementById('book-grid');
  const cards = grid.querySelectorAll('.book-card');
  assertEqual(cards.length, 0, 'T010: renderBookList with empty array clears grid');

  renderBookList(null);
  const emptyState = document.getElementById('empty-state');
  assert(!emptyState.hidden, 'T010: empty state is shown when no books');
  assert(emptyState.querySelector('.empty-message').textContent.length > 0,
    'T010: empty state has message text');
}

// ── T011 Tests ────────────────────────────────────────────────────────────

function testSearchByTitle() {
  const books = [
    { id: 's1', title: 'The Hobbit', author: 'JRR Tolkien', language: 'English', genre: 'Fantasy', totalPages: 300, currentPage: 0, status: 'unread' },
    { id: 's2', title: 'Dune', author: 'Frank Herbert', language: 'English', genre: 'Sci-Fi', totalPages: 500, currentPage: 0, status: 'unread' },
    { id: 's3', title: 'The Lord of the Rings', author: 'JRR Tolkien', language: 'English', genre: 'Fantasy', totalPages: 1000, currentPage: 0, status: 'unread' }
  ];
  const results = searchBooks('Hobbit', books);
  assertEqual(results.length, 1, 'T011: search by title finds exact match');
  assertEqual(results[0].title, 'The Hobbit', 'T011: search returns correct book');
}

function testSearchByAuthor() {
  const books = [
    { id: 's1', title: 'The Hobbit', author: 'JRR Tolkien', language: 'English', genre: 'Fantasy', totalPages: 300, currentPage: 0, status: 'unread' },
    { id: 's2', title: 'Dune', author: 'Frank Herbert', language: 'English', genre: 'Sci-Fi', totalPages: 500, currentPage: 0, status: 'unread' },
    { id: 's3', title: 'The Lord of the Rings', author: 'JRR Tolkien', language: 'English', genre: 'Fantasy', totalPages: 1000, currentPage: 0, status: 'unread' }
  ];
  const results = searchBooks('Tolkien', books);
  assertEqual(results.length, 2, 'T011: search by author finds all books by author');
}

function testSearchCaseInsensitive() {
  const books = [
    { id: 's1', title: 'Machine Learning', author: 'Expert', language: 'English', genre: 'Technology', totalPages: 400, currentPage: 0, status: 'unread' }
  ];
  const results = searchBooks('machine learning', books);
  assertEqual(results.length, 1, 'T011: search is case-insensitive');
}

function testSearchNoMatch() {
  const books = [
    { id: 's1', title: 'The Hobbit', author: 'Tolkien', language: 'English', genre: 'Fantasy', totalPages: 300, currentPage: 0, status: 'unread' }
  ];
  const results = searchBooks('zzzznotabook', books);
  assertEqual(results.length, 0, 'T011: search returns empty for no match');
}

function testSearchEmptyQuery() {
  const books = [
    { id: 's1', title: 'Test', author: 'Author', language: 'English', genre: 'Fiction', totalPages: 100, currentPage: 0, status: 'unread' }
  ];
  assertEqual(searchBooks('', books), books, 'T011: empty query returns all books');
  assertEqual(searchBooks('  ', books), books, 'T011: whitespace query returns all books');
  assertEqual(searchBooks(null, books), books, 'T011: null query returns all books');
}

function testSearchMalayalam() {
  const books = [
    { id: 'ml1', title: 'ആടുജീവിതം', author: 'ബെന്യാമിൻ', language: 'Malayalam', genre: 'Fiction', totalPages: 200, currentPage: 0, status: 'unread' },
    { id: 'en1', title: 'English Book', author: 'Author', language: 'English', genre: 'Fiction', totalPages: 100, currentPage: 0, status: 'unread' }
  ];
  const results = searchBooks('ആടുജീവിതം', books);
  assertEqual(results.length, 1, 'T011: search works with Malayalam Unicode text');
  assertEqual(results[0].id, 'ml1', 'T011: Malayalam search finds correct book');

  const authorResults = searchBooks('ബെന്യാമിൻ', books);
  assertEqual(authorResults.length, 1, 'T011: search by Malayalam author works');
}

// ── Run tests on module load ────────────────────────────────────────────────
runAllTests();

// ── Application Initialization ──────────────────────────────────────────────
async function initApp() {
  const statsEl = document.getElementById('library-stats');

  // Wire up all UI interactions first
  setupThemeToggle();
  setupCardActions();
  setupSearch();
  setupFilters();
  setupAddBook();

  // Try loading from localStorage first
  const stored = loadBooks();
  if (stored && stored.length > 0) {
    updateStats(stored.length);
    renderBookList(stored);
    console.log(`📚 Loaded ${stored.length} books from localStorage.`);
    return;
  }

  // First run: load mock data
  try {
    const resp = await fetch('../data/books.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const mockBooks = await resp.json();
    initBooks(mockBooks);
    updateStats(mockBooks.length);
    renderBookList(mockBooks);
    console.log(`📚 Seeded ${mockBooks.length} books from mock data.`);
  } catch (e) {
    console.error('Failed to load mock data:', e);
    if (statsEl) statsEl.textContent = '⚠️ Could not load library data.';
  }
}

function updateStats(count) {
  const statsEl = document.getElementById('library-stats');
  if (statsEl) {
    const mlCount = getAllBooks().filter(b => b.language === 'Malayalam').length;
    const enCount = count - mlCount;
    const readingCount = getAllBooks().filter(b => b.status === 'reading').length;
    statsEl.textContent = `${count} books · ${mlCount} Malayalam · ${enCount} English · ${readingCount} reading`;
  }
}

// Boot
initApp();
