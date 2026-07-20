import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName,
  entryUrl,
  parseInput,
  parseGoUrl,
  parseSearchRedirect,
  resolve,
  resolveText,
  resolveUrl,
} from '../src/resolver.js';

const SHORTCUTS = {
  calendar: { url: 'https://outlook.cloud.microsoft/calendar' },
  gh: { url: 'https://github.com/search?q=%s' },
  docs: 'https://m365.cloud.microsoft', // string form
};

test('normalizeName lowercases and trims', () => {
  assert.equal(normalizeName('  Calendar  '), 'calendar');
  assert.equal(normalizeName(null), '');
});

test('entryUrl handles object and string entries', () => {
  assert.equal(entryUrl({ url: 'https://x.com' }), 'https://x.com');
  assert.equal(entryUrl('https://y.com'), 'https://y.com');
  assert.equal(entryUrl(undefined), '');
});

test('parseInput splits command and rest', () => {
  assert.deepEqual(parseInput('calendar'), { command: 'calendar', rest: '' });
  assert.deepEqual(parseInput('gh copilot cli'), { command: 'gh', rest: 'copilot cli' });
  assert.deepEqual(parseInput('gh/copilot/cli'), { command: 'gh', rest: 'copilot/cli' });
  assert.deepEqual(parseInput('  /calendar '), { command: 'calendar', rest: '' });
  assert.deepEqual(parseInput(''), { command: '', rest: '' });
});

test('parseGoUrl only matches host "go"', () => {
  assert.deepEqual(parseGoUrl('http://go/calendar'), { command: 'calendar', rest: '' });
  assert.deepEqual(parseGoUrl('http://go/gh/my%20query'), { command: 'gh', rest: 'my query' });
  assert.equal(parseGoUrl('https://microsoft.com/calendar'), null);
  assert.equal(parseGoUrl('not a url'), null);
});

test('parseGoUrl preserves query string as rest', () => {
  assert.deepEqual(parseGoUrl('http://go/gh?foo=bar'), { command: 'gh', rest: 'foo=bar' });
});

test('parseSearchRedirect catches go-links searched on search engines', () => {
  assert.deepEqual(
    parseSearchRedirect('https://www.google.com/search?q=go/calendar'),
    { command: 'calendar', rest: '' }
  );
  assert.deepEqual(
    parseSearchRedirect('https://www.google.com/search?q=go%2Fgh%2Fmy+query'),
    { command: 'gh', rest: 'my query' }
  );
  // Space form (e.g. "go calendar") and other engines / query params.
  assert.deepEqual(
    parseSearchRedirect('https://duckduckgo.com/?q=go%20calendar'),
    { command: 'calendar', rest: '' }
  );
  assert.deepEqual(
    parseSearchRedirect('https://search.yahoo.com/search?p=go/mail'),
    { command: 'mail', rest: '' }
  );
  assert.deepEqual(
    parseSearchRedirect('https://google.co.uk/search?q=go/drive'),
    { command: 'drive', rest: '' }
  );
});

test('parseSearchRedirect ignores non-search hosts and non-go queries', () => {
  assert.equal(parseSearchRedirect('https://example.com/search?q=go/calendar'), null);
  assert.equal(parseSearchRedirect('https://www.google.com/search?q=golang tutorial'), null);
  assert.equal(parseSearchRedirect('https://www.google.com/search?q=go'), null);
  assert.equal(parseSearchRedirect('https://www.google.com/search'), null);
  assert.equal(parseSearchRedirect('not a url'), null);
});

test('resolve returns plain URL when no args', () => {
  assert.equal(resolve('calendar', '', SHORTCUTS), 'https://outlook.cloud.microsoft/calendar');
});

test('resolve is case-insensitive', () => {
  assert.equal(resolve('CALENDAR', '', SHORTCUTS), 'https://outlook.cloud.microsoft/calendar');
});

test('resolve substitutes %s and URL-encodes the args', () => {
  assert.equal(
    resolve('gh', 'hello world', SHORTCUTS),
    'https://github.com/search?q=hello%20world'
  );
});

test('resolve appends path when target has no %s', () => {
  assert.equal(
    resolve('calendar', 'view/week', SHORTCUTS),
    'https://outlook.cloud.microsoft/calendar/view/week'
  );
});

test('resolve supports string-form entries', () => {
  assert.equal(resolve('docs', '', SHORTCUTS), 'https://m365.cloud.microsoft');
});

test('resolve returns null for unknown command', () => {
  assert.equal(resolve('nope', '', SHORTCUTS), null);
  assert.equal(resolve('', '', SHORTCUTS), null);
});

test('resolveText end-to-end', () => {
  assert.deepEqual(resolveText('gh copilot', SHORTCUTS), {
    command: 'gh',
    rest: 'copilot',
    url: 'https://github.com/search?q=copilot',
  });
});

test('resolveUrl end-to-end', () => {
  assert.deepEqual(resolveUrl('http://go/calendar', SHORTCUTS), {
    command: 'calendar',
    rest: '',
    url: 'https://outlook.cloud.microsoft/calendar',
  });
  assert.equal(resolveUrl('http://example.com', SHORTCUTS).url, null);
});
