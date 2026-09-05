import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { createTelemetry, listPublicCommandCenterState } from '../server/command-center/telemetry.js';
import { _setSqlForTests } from '../server/command-center/db.js';
import { normalizePublicState } from '../src/command-center/stateModel.mjs';

const connectionString = process.env.CC_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set CC_TEST_DATABASE_URL to a disposable local PostgreSQL database.');
const url = new URL(connectionString);
if (!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Verification accepts local disposable databases only.');
const schema = `cc_verify_${Date.now()}`;
const admin = new pg.Pool({ connectionString });
await admin.query(`CREATE SCHEMA ${schema}`);
const pool = new pg.Pool({ connectionString, max: 12, options: `-c search_path=${schema},public` });
let checks = 0;
try {
  await pool.query(fs.readFileSync('migrations/20260820000000_create_command_center.sql','utf8'));
  _setSqlForTests(async (strings,...values) => (await pool.query(strings.reduce((q,s,i)=>q+(i?`$${i}`:'')+s,''),values)).rows);
  const now=Date.now(), stamp=new Date(now).toISOString(), startedAt=new Date(now-1000).toISOString();
  const event=(eventId,overrides={})=>({eventId,agent:'spawncamper9000',workflow:'ai-news',workflowLabel:'AI News',
    state:'coding',activity:'Code review',context:{},publicUrl:null,timestamp:stamp,startedAt,ttlSeconds:900,
    expiresAt:new Date(now+900000).toISOString(),...overrides});
  const duplicates=await Promise.all(Array.from({length:24},()=>createTelemetry(event('duplicate'))));
  assert.equal(duplicates.filter(e=>e.status==='created').length,1);assert.equal(new Set(duplicates.map(e=>e.id)).size,1);checks++;
  await Promise.all(Array.from({length:24},(_,i)=>createTelemetry(event(`ordered-${String(i).padStart(2,'0')}`))));
  let state=await listPublicCommandCenterState({agent:'spawncamper9000',now});
  assert.equal(state.workflows[0].eventId,'ordered-23');checks++;
  await createTelemetry(event('zzz-old',{timestamp:new Date(now-1).toISOString()}));
  assert.equal((await listPublicCommandCenterState({agent:'spawncamper9000'})).workflows[0].eventId,'ordered-23');checks++;
  // Simulate the previous implementation's persisted event / missing latest row.
  await pool.query('DELETE FROM command_center_workflow_state');
  const repaired=await createTelemetry(event('ordered-23',{state:'error',activity:'Retry must not mutate original'}));
  assert.equal(repaired.status,'duplicate');
  state=await listPublicCommandCenterState({agent:'spawncamper9000'});
  assert.equal(state.workflows[0].state,'coding');assert.equal(state.workflows[0].activity,'Code review');checks++;
  await pool.query('UPDATE command_center_workflow_state SET latest_event_id = NULL');
  await createTelemetry(event('ordered-23'));
  assert.equal((await listPublicCommandCenterState({agent:'spawncamper9000'})).workflows[0].id,repaired.id);checks++;
  // Fail latest-state advancement after event INSERT: the event must roll back.
  await pool.query(`CREATE FUNCTION fail_latest() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.activity = 'injected failure' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_latest BEFORE INSERT OR UPDATE ON command_center_workflow_state FOR EACH ROW EXECUTE FUNCTION fail_latest()`);
  await assert.rejects(createTelemetry(event('zz-failure',{activity:'injected failure'})),/injected failure/);
  assert.equal((await pool.query("SELECT count(*)::int n FROM command_center_events WHERE event_id='zz-failure'")).rows[0].n,0);
  await pool.query('DROP TRIGGER fail_latest ON command_center_workflow_state');
  assert.equal((await createTelemetry(event('zz-failure',{activity:'injected failure'}))).status,'created');checks++;
  await createTelemetry(event('other-agent',{agent:'someone-else',state:'error'}));
  state=await listPublicCommandCenterState({agent:'spawncamper9000',historyLimit:100});
  assert.ok(state.workflows.every(e=>e.agent==='spawncamper9000'));assert.ok(state.recentHistory.every(e=>e.agent==='spawncamper9000'));checks++;
  // The indexed activity lookup must work even when public history is disabled.
  const finishTime=new Date(now+100).toISOString();
  await createTelemetry(event('complete',{state:'complete',timestamp:finishTime}));
  state=await listPublicCommandCenterState({agent:'spawncamper9000',historyLimit:0,now:now+100});
  assert.equal(state.recentHistory.length,0);assert.equal(state.workflows[0].lastActivity.state,'coding');
  assert.equal(normalizePublicState({...state,success:true,fetchedAt:finishTime},now+100).primaryWorkflow.areaId,'github-code');checks++;
  await createTelemetry(event('new-job-wait',{state:'waiting',timestamp:new Date(now+200).toISOString(),startedAt:new Date(now+150).toISOString()}));
  state=await listPublicCommandCenterState({agent:'spawncamper9000',historyLimit:0,now:now+200});
  assert.equal(state.workflows[0].lastActivity,null);checks++;
  console.log(`PostgreSQL: ${checks} checks passed (concurrency, deduplication, atomic rollback, retry repair, ordering, agent isolation, reload retention, job boundaries).`);
} finally {
  _setSqlForTests(null);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
