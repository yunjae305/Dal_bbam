import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedCuratedCourses } from './seed-curated-courses.mjs';

const course = {
  title: 'Existing route', description: 'Updated introduction', transport: 'walking', theme: 'heritage',
  stops: [
    { patterns: ['First place'], categories: ['heritage'], reason: 'First stop', stayMinutes: 30 },
    { patterns: ['Second place'], categories: ['heritage'], reason: 'Second stop', stayMinutes: 60 }
  ]
};
const original = { id: 'existing-course-id', title: course.title, share_token: 'preserve-this-share-token', metadata: { theme: 'food', operatorNote: 'preserve this note' }, stops: ['original-stop'] };
function fixture({ existing = [original], missingPattern, failRpc = false, rpcPresent = true } = {}) {
  const rows = structuredClone(existing);
  const calls = [];
  const reads = [];
  const db = {
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        ilike(key, value) { filters[key] = value; return query; },
        limit() { return query; },
        then(resolve) {
          reads.push({ table, filters });
          if (table === 'courses') return Promise.resolve({ data: rows.filter(row => row.title === filters.title), error: null }).then(resolve);
          const pattern = filters.name.replaceAll('%', '');
          return Promise.resolve({ data: pattern === missingPattern ? [] : [{ id: pattern, name: pattern, category: 'heritage' }], error: null }).then(resolve);
        }
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args, readsAtMutation: reads.length });
      if (failRpc) return { data: null, error: { code: '23503' } };
      let row = rows.find(item => item.id === args.p_id);
      if (row) Object.assign(row, { title: args.p_title, metadata: { ...row.metadata, theme: args.p_theme }, stops: args.p_items });
      else { row = { id: 'new-course-id', title: args.p_title, share_token: args.p_share_token, metadata: { theme: args.p_theme }, stops: args.p_items }; rows.push(row); }
      return { data: { id: row.id }, error: null };
    }
  };
  const fetcher = async (_input, options) => {
    assert.equal(options.headers.Accept, 'application/openapi+json');
    return Response.json({ paths: rpcPresent ? { '/rpc/save_curated_course': { post: {} } } : {} });
  };
  return { db, fetcher, calls, reads, rows };
}
const options = state => ({ ...state, url: 'https://database.example', secret: 'private-service-key', courses: [course] });

test('updates one existing course through the atomic RPC while preserving its identity, token and other metadata', async () => {
  const state = fixture();
  const result = await seedCuratedCourses(options(state));
  assert.deepEqual(result, [{ id: original.id, title: original.title, updated: true, stops: 2 }]);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].name, 'save_curated_course');
  assert.equal(state.calls[0].args.p_id, original.id);
  assert.equal(state.calls[0].args.p_share_token, original.share_token);
  assert.equal(state.calls[0].readsAtMutation, 3);
  assert.deepEqual(state.calls[0].args.p_items.map(item => [item.place_id, item.order_index]), [['First place', 0], ['Second place', 1]]);
  assert.equal(state.rows[0].share_token, original.share_token);
  assert.equal(state.rows[0].metadata.operatorNote, original.metadata.operatorNote);
});

test('refuses duplicate same-title records without deleting or mutating either course', async () => {
  const state = fixture({ existing: [original, { ...original, id: 'duplicate-id' }] });
  const before = structuredClone(state.rows);
  await assert.rejects(seedCuratedCourses(options(state)), /seed_duplicate_course_title_requires_manual_resolution/);
  assert.equal(state.calls.length, 0);
  assert.deepEqual(state.rows, before);
});

test('verifies the required RPC from read-only metadata before any catalogue mutation', async () => {
  const state = fixture({ rpcPresent: false });
  await assert.rejects(seedCuratedCourses(options(state)), /seed_required_rpc_missing/);
  assert.equal(state.reads.length, 0);
  assert.equal(state.calls.length, 0);
});

test('resolves every course before saving any: a missing later stop leaves earlier courses unchanged', async () => {
  const state = fixture({ missingPattern: 'Unavailable place' });
  const before = structuredClone(state.rows);
  await assert.rejects(seedCuratedCourses({ ...options(state), courses: [course, { ...course, title: 'Later route', stops: [{ patterns: ['Unavailable place'], categories: ['heritage'] }] }] }), /seed_required_place_missing/);
  assert.equal(state.calls.length, 0);
  assert.deepEqual(state.rows, before);
});

test('does not fall back to destructive operations when the atomic save fails', async () => {
  const state = fixture({ failRpc: true });
  const before = structuredClone(state.rows);
  await assert.rejects(seedCuratedCourses(options(state)), /seed_atomic_course_save_failed/);
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.rows, before);
});

test('creates a missing course with an explicit new share token and ordered visits', async () => {
  const state = fixture({ existing: [] });
  const result = await seedCuratedCourses(options(state));
  assert.equal(state.calls[0].args.p_id, null);
  assert.match(state.calls[0].args.p_share_token, /^[0-9a-f]{32}$/);
  assert.equal(result[0].updated, false);
  assert.equal(state.rows[0].stops.length, 2);
});
