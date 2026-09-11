const assert = require('node:assert/strict');
const N = require('../outputs/order-3/notes-core.js');
let raw = null;
const storage = { getItem: key => { assert.equal(key, N.KEY); return raw; }, setItem: (key, value) => { assert.equal(key, N.KEY); raw = value; } };
const note = (id, body = '日本語と絵文字 🧭\n**考えたこと**\n</textarea><img src=x onerror=alert(1)>') => ({ id, body, kind: 'impression', createdAt: '2026-09-11T12:00:00.000Z', updatedAt: '2026-09-11T12:00:00.000Z', scene: null, share: { state: 'local-only', handoffOpenedAt: null, externalUrl: null } });
const store = N.createStore(() => storage);
assert(store.load()); assert.deepEqual(store.notes, []);
assert(store.save(note('empty', ' \n '))); assert.equal(store.notes.length, 0);
for (const [index, kind] of Object.keys(N.KINDS).entries()) { assert(store.save({ ...note(`n-${index}`), kind })); }
assert.equal(store.notes.length, 3);
const first = store.notes.find(n => n.id === 'n-0');
assert(store.save({ ...first, body: 'edited 🧭' }));
assert.equal(store.notes.length, 3);
assert.equal(store.notes.find(n => n.id === first.id).createdAt, first.createdAt);
assert(Date.parse(store.notes.find(n => n.id === first.id).updatedAt) > Date.parse(first.updatedAt));
const restored = N.createStore(() => storage); assert(restored.load()); assert.deepEqual(restored.notes, store.notes);
const retained = raw;
for (const invalid of ['broken {', JSON.stringify({ schemaVersion: 2, notes: [] }), JSON.stringify({ schemaVersion: 1, notes: [note('--><script>')] })]) {
  raw = invalid;
  assert.equal(store.load(), false); assert.equal(store.save(note('not-written')), false); assert.equal(raw, invalid); assert.equal(store.raw, invalid);
}
raw = retained;
for (const method of ['getItem', 'setItem']) {
  for (const failure of ['SecurityError', 'QuotaExceededError']) {
    const broken = N.createStore(() => ({ ...storage, [method]() { throw new Error(failure); } }));
    broken.load(); assert.equal(broken.save(note('failed')), false); assert(broken.error.includes(failure)); assert.equal(raw, retained);
  }
}
const unavailable = N.createStore(() => { throw new Error('denied'); });
assert.equal(unavailable.load(), false); assert.equal(unavailable.save(note('failure')), false);
// Both tabs can retain a locally durable note even after a competing whole-key write.
raw = null;
const tabA = N.createStore(() => storage), tabB = N.createStore(() => storage);
tabA.load(); tabB.load(); tabA.save(note('a')); const aPayload = raw;
raw = null; tabB.save(note('b')); const bPayload = raw;
assert(tabA.receive(bPayload)); assert(tabB.receive(aPayload));
assert.deepEqual(N.parse(raw).notes.map(n => n.id).sort(), ['a', 'b']);
const extra = { schemaVersion: 1, extension: { preserve: true }, notes: [{ ...note('ext'), optionalField: 'preserve' }] };
raw = JSON.stringify(extra); const extensible = N.createStore(() => storage); extensible.load(); extensible.save(note('another'));
assert.deepEqual(N.parse(raw).extension, extra.extension); assert.equal(N.parse(raw).notes.find(n => n.id === 'ext').optionalField, 'preserve');
for (const body of [note('short').body, '終わりまで保存🧭\n'.repeat(1000)]) {
  const n = note('share', body), payload = N.sharePayload(n), url = new URL(payload.url);
  assert.equal(url.origin + url.pathname, N.TARGET); assert(url.searchParams.get('title').startsWith('[ORDER//3 メモ]'));
  assert.equal(payload.body, N.markdown(n)); assert(payload.body.includes(body)); assert(payload.body.startsWith('<!-- order3-feedback:v1 note-id=share -->'));
  assert.equal(url.searchParams.has('body'), !payload.long);
  if (!payload.long) assert.equal(url.searchParams.get('body'), payload.body);
  assert.deepEqual([...url.searchParams.keys()], payload.long ? ['title'] : ['title', 'body']);
  assert(!payload.body.includes('### 場面'));
}
assert.match(N.newId({}), /^note-/);
// ACT13-QA-01: metadata-only writes must never promote a stale content revision.
raw = null;
const shareA = N.createStore(() => storage), shareB = N.createStore(() => storage);
shareA.load(); shareA.save(note('shared-id', 'original A'));
const oldRevision = shareA.notes[0];
shareB.load(); shareB.save({ ...shareB.notes[0], body: 'new B', kind: 'bug', scene: {
  capturedAt: '2026-09-12T00:00:00.000Z', gameVersion: 'ACT 13', turn: 4, phase: 'planning',
  selection: null, orders: [], preview: { kind: 'current', eventIndex: null, eventKey: null, label: '現在盤面' }
} });
const newerRevision = N.clone(shareB.notes[0]), beforeStaleHandoff = raw;
assert.equal(shareA.recordHandoff(oldRevision,'2026-09-12T01:00:00.000Z'),'changed');
assert.equal(raw,beforeStaleHandoff);
assert.deepEqual(shareA.notes[0],newerRevision);
assert.equal(shareA.recordHandoff(newerRevision,'2026-09-12T01:00:00.000Z'),'saved');
let handed = N.parse(raw).notes[0];
assert.equal(handed.updatedAt,newerRevision.updatedAt); assert(N.sameContent(handed,newerRevision));
assert.equal(handed.share.state,'handoff-opened');
assert.equal(shareB.recordHandoff(newerRevision,'2026-09-12T02:00:00.000Z'),'saved');
const repeated = N.parse(raw).notes[0];
assert.equal(repeated.updatedAt,newerRevision.updatedAt); assert.equal(repeated.share.handoffOpenedAt,'2026-09-12T02:00:00.000Z');
// Late metadata events cannot roll back newer content, and clean copies retain the handoff timestamp.
assert.equal(N.merge([repeated],[newerRevision])[0].share.handoffOpenedAt,repeated.share.handoffOpenedAt);
assert.equal(N.merge([newerRevision],[repeated])[0].share.handoffOpenedAt,repeated.share.handoffOpenedAt);
const delayedOldHandoff = { ...oldRevision, share:{state:'handoff-opened',handoffOpenedAt:'2099-01-01T00:00:00.000Z',externalUrl:N.TARGET} };
assert(N.sameContent(N.merge([delayedOldHandoff],[repeated])[0],newerRevision));
assert(N.sameContent(N.merge([repeated],[delayedOldHandoff])[0],newerRevision));
for (const field of ['body','kind','scene']) {
  const changed = { ...newerRevision, [field]:oldRevision[field] };
  assert(!N.sameContent(changed,newerRevision), `${field} changes require content confirmation`);
}
const currentRaw = raw;
const shareFailure = N.createStore(()=>({...storage,setItem(){throw new Error('QuotaExceededError');}}));
shareFailure.load(); assert.equal(shareFailure.recordHandoff(repeated,'2026-09-12T03:00:00.000Z'),'error'); assert.equal(raw,currentRaw);
for(const invalid of ['{broken',JSON.stringify({schemaVersion:99,notes:[]})]) {
  raw=invalid; assert.equal(shareA.recordHandoff(repeated,'2026-09-12T03:00:00.000Z'),'error'); assert.equal(raw,invalid);
}
console.log('ORDER//3 notes storage/share tests passed');
