import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocomotion } from '../src/command-center/locomotion.mjs';
import { createTelemetryClient } from '../src/command-center/telemetryClient.mjs';
import { normalizePublicState } from '../src/command-center/stateModel.mjs';
import { routeThroughWalkGraph } from '../src/command-center/walkGraph.mjs';
import { COMMAND_CENTER_AREAS as areas, COMMAND_CENTER_WALK_GRAPH as graph } from '../src/command-center/sceneConfig.mjs';
import { footPositionClear, FOOT_ENVELOPE, STATION_GEOMETRY } from '../src/command-center/stationGeometry.mjs';
import measurements from '../src/command-center/assetMeasurements.json' with { type: 'json' };
import { readRgbaPng } from '../scripts/lib/png.js';
import { CAMPER_SHEETS } from '../src/command-center/camperSheets.mjs';
import { PROP_SHEETS } from '../src/command-center/propSheets.mjs';

const home = { x: 480, y: 228 };
const command = (id, overrides = {}) => ({ destination: areas.find(a=>a.id===id).destination, station: id, mode: 'operate', ...overrides });
test('arrival commits stationary pose and attendance once, including zero-distance and restoration', () => {
  for (const immediate of [false, true]) {
    const c = createLocomotion({ position: home });
    c.command(command('scanner-bench', { immediate }));
    if (!immediate) { assert.equal(c.state.attendance, ''); assert.match(c.state.visual, /^walk_/); }
    c.update(10000);
    assert.equal(c.state.visual, 'operate_back'); assert.equal(c.state.attendance, 'scanner-bench');
    assert.deepEqual(c.state.position, command('scanner-bench').destination);
    const arrived = c.state.arrived, generation = c.state.generation;
    c.command(command('scanner-bench', { immediate })); c.update(1000);
    assert.equal(c.state.arrived, arrived); assert.equal(c.state.generation, generation);
    c.command(command('scanner-bench', { mode: 'idle', station: '' }));
    assert.equal(c.state.visual, 'idle'); assert.equal(c.state.attendance, '');
  }
});
test('heartbeats preserve travel; rapid retargeting uses actual foot position and cancels idle return', () => {
  const c = createLocomotion({ position: home });
  c.command(command('scanner-bench')); c.update(100);
  assert.deepEqual(c.state.position, { x: 462, y: 228 }); // exactly 180px/s
  const generation = c.state.generation;
  c.command(command('scanner-bench')); assert.equal(c.state.generation, generation);
  c.command(command('central-operations', { station: '', mode: 'idle' }));
  c.update(50); assert.deepEqual(c.state.position, { x: 471, y: 228 });
  c.command(command('intelligence-research')); c.update(20000);
  assert.deepEqual(c.state.position, { x: 164, y: 180 });
  assert.equal(c.state.attendance, 'intelligence-research');
  c.cancel(); c.update(100000); assert.equal(c.state.attendance, '');
});
test('invalid and disconnected routes fail closed', () => {
  assert.equal(routeThroughWalkGraph(home, {x:100,y:100}), null);
  assert.equal(routeThroughWalkGraph({x:0,y:0},{x:10,y:10}, [
    {from:{x:0,y:0},to:{x:1,y:0}}, {from:{x:10,y:10},to:{x:11,y:10}}
  ]), null);
  const c = createLocomotion({ position:home }); c.command({destination:{x:100,y:100},immediate:true});
  assert.equal(c.state.failed,true); assert.deepEqual(c.state.position,home);
});
test('every ordered station pair and intermediate corridor position is clear and connected', () => {
  const samples = [];
  for (const segment of graph.segments) {
    const n = Math.abs(segment.to.x-segment.from.x)+Math.abs(segment.to.y-segment.from.y);
    for (let i=0;i<=n;i++) {
      const p = {x:segment.from.x+(segment.to.x-segment.from.x)*i/n,y:segment.from.y+(segment.to.y-segment.from.y)*i/n};
      assert.ok(footPositionClear(p), `${segment.id}: ${JSON.stringify(p)}`);
      if (i % 47 === 0) samples.push(p);
    }
  }
  for (const from of [...areas.map(a=>a.destination),...samples]) for (const area of areas) {
    const path = routeThroughWalkGraph(from,area.destination); assert.ok(path);
    assert.deepEqual(path.at(-1),area.destination);
    let prior = from;
    for (const p of path) {
      assert.ok(p.x===prior.x || p.y===prior.y);
      assert.ok(footPositionClear(p)); prior=p;
    }
  }
  assert.deepEqual(routeThroughWalkGraph({x:401.5,y:228},{x:480,y:228}),[{x:480,y:228}], 'no nearest-node backtracking');
  assert.equal(STATION_GEOMETRY.size,13);
});
test('checked-in measurements agree with every opaque pixel in every shipped frame', () => {
  for (const entry of [...CAMPER_SHEETS,...PROP_SHEETS]) {
    const m=measurements[entry.key||entry.textureKey]; if(!m)continue;
    const png=readRgbaPng(`public${entry.art}`);
    for(let f=0;f<m.frames.length;f++) {
      let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
      for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++) {
        if(!png.pixels[(y*png.width+f*m.width+x)*4+3])continue;
        l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);
        if(entry.key?.startsWith('spawn') && y>=m.height-8) {
          assert.ok(x-m.width/2>=FOOT_ENVELOPE.left && x+1-m.width/2<=FOOT_ENVELOPE.right);
        }
      }
      assert.deepEqual(m.frames[f].visual,{left:l,right:r,top:t,bottom:b});
    }
  }
});
const epoch=Date.parse('2026-09-05T12:00:00Z');
const entry=(overrides={})=>({agent:'spawncamper9000',workflow:'ai-news',state:'researching',activity:'Research',
  timestamp:new Date(epoch).toISOString(),startedAt:new Date(epoch-1000).toISOString(),ttlSeconds:30,...overrides});
const payload=(workflows=[entry()], now=epoch)=>({success:true,fetchedAt:new Date(now).toISOString(),workflows,recentHistory:[]});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness() {
  let now=epoch,id=0;
  const jobs=new Map(), pending=[], states=[], statuses=[], listeners=new Map();
  const timers={setTimeout(fn,delay){jobs.set(++id,{fn,at:now+delay});return id;},clearTimeout(id){jobs.delete(id);}};
  const doc={visibilityState:'visible',addEventListener(k,fn){listeners.set(k,fn);},removeEventListener(k){listeners.delete(k);}};
  const client=createTelemetryClient({timers,clock:()=>now,documentRef:doc,timeoutMs:1000,
    fetchImpl:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject})),
    onState:s=>states.push(s),onStatus:s=>statuses.push(s)});
  return {client,states,statuses,pending,jobs,listeners,doc,
    async tick(ms){const end=now+ms; while(true){const next=[...jobs].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();await flush();}now=end;await flush();},
    async respond(index,body){pending[index].resolve({ok:true,json:async()=>body});await flush();}};
}
test('actual polling client ignores reversed requests and responses after stop/start',async()=>{
  const h=harness();h.client.start();h.client.refresh();
  assert.equal(h.pending[0].options.signal.aborted,true);
  await h.respond(1,payload([entry({activity:'new'})],epoch+100));
  await h.respond(0,payload([entry({activity:'old'})]));
  assert.equal(h.states.at(-1).primaryWorkflow.activity,'new');
  h.client.refresh();h.client.stop();const count=h.states.length;
  await h.respond(2,payload([entry({activity:'after stop'})],epoch+200));
  assert.equal(h.states.length,count);assert.equal(h.jobs.size,0);assert.equal(h.listeners.size,0);
  h.client.start();await h.respond(3,payload([entry({activity:'restart'})],epoch+300));
  assert.equal(h.states.at(-1).primaryWorkflow.activity,'restart');h.client.destroy();
});
test('timeouts, malformed payloads, older snapshots and outages retain state only until expiry',async()=>{
  const h=harness();h.client.start();await h.respond(0,payload());
  assert.equal(h.pending[0].url.searchParams.get('agent'),'spawncamper9000');
  h.client.refresh();await h.respond(1,{success:true,workflows:[]});
  assert.equal(h.statuses.at(-1).status,'offline');assert.equal(h.states.at(-1).activeWorkflows.length,1);
  h.client.refresh();await h.respond(2,payload([],epoch-1));assert.equal(h.states.at(-1).activeWorkflows.length,1);
  h.client.refresh();await h.tick(1000);assert.equal(h.pending[3].options.signal.aborted,true);
  assert.match(h.statuses.at(-1).error.message,/timed out/);
  await h.tick(31000);assert.equal(h.states.at(-1).activeWorkflows.length,0);assert.equal(h.states.at(-1).staleCount,1);
  h.doc.visibilityState='visible';const requests=h.pending.length;h.listeners.get('visibilitychange')();
  assert.equal(h.pending.length,requests+1);h.client.destroy();assert.equal(h.jobs.size,0);
});
test('unknown entries cannot create warnings; heartbeat focus is stable but meaningful work preempts',()=>{
  assert.equal(normalizePublicState(payload([null,{},entry({state:'bogus'})]),epoch).primaryWorkflow,null);
  const a=entry(), b=entry({workflow:'github',state:'coding',activity:'Code',timestamp:new Date(epoch-100).toISOString()});
  const first=normalizePublicState(payload([a,b]),epoch);
  const heartbeat=normalizePublicState(payload([a,{...b,timestamp:new Date(epoch+10).toISOString()}]),epoch+10,{previousState:first});
  assert.equal(heartbeat.primaryWorkflow.workflow,'ai-news');
  const changed=normalizePublicState(payload([a,{...b,activity:'Review code',timestamp:new Date(epoch+20).toISOString()}]),epoch+20,{previousState:heartbeat});
  assert.equal(changed.primaryWorkflow.workflow,'github');
  const error=normalizePublicState(payload([entry({state:'error'}),b,entry({agent:'other',state:'warning'})]),epoch,{previousState:changed,agent:'spawncamper9000'});
  assert.equal(error.primaryWorkflow.workflow,'ai-news');assert.equal(error.workflows.length,2);
});
test('stationless status retains last activity across live updates and reload, bounded by startedAt',()=>{
  const first=normalizePublicState(payload([entry({state:'coding'})]),epoch);
  for(const state of ['waiting','complete','warning','error']) {
    const current=entry({state,timestamp:new Date(epoch+100).toISOString()});
    const next=normalizePublicState(payload([current]),epoch+100,{previousState:first});
    assert.equal(next.primaryWorkflow.areaId,'github-code');
    const reloaded=normalizePublicState(payload([{...current,lastActivity:next.primaryWorkflow.lastActivity}]),epoch+100);
    assert.equal(reloaded.primaryWorkflow.areaId,'github-code');
    const newJob=normalizePublicState(payload([{...current,startedAt:new Date(epoch+50).toISOString(),lastActivity:next.primaryWorkflow.lastActivity}]),epoch+100);
    assert.equal(newJob.primaryWorkflow.areaId,'intelligence-research');
  }
});

test('authoritative empty activity and equal-timestamp completed boundaries prevent station leakage', () => {
  const prior = normalizePublicState(payload([entry({state:'coding'})]), epoch);
  const current = entry({state:'waiting', eventId:'z'});
  assert.equal(normalizePublicState(payload([{...current,lastActivity:null}]),epoch,{previousState:prior}).primaryWorkflow.areaId,'intelligence-research');
  const history = [entry({state:'coding',eventId:'a'}),entry({state:'complete',eventId:'b'})];
  assert.equal(normalizePublicState({...payload([current]),recentHistory:history},epoch).primaryWorkflow.areaId,'intelligence-research');
});

test('all station routes match an independent unit-grid shortest-path oracle', () => {
  const lattice = new Map();
  const key = p => `${p.x},${p.y}`;
  for (const segment of graph.segments) {
    const dx = Math.sign(segment.to.x - segment.from.x), dy = Math.sign(segment.to.y - segment.from.y);
    const length = Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y);
    let previous = null;
    for (let i = 0; i <= length; i++) {
      const k = key({x:segment.from.x+dx*i,y:segment.from.y+dy*i});
      if (!lattice.has(k)) lattice.set(k,new Set());
      if (previous) { lattice.get(k).add(previous); lattice.get(previous).add(k); }
      previous = k;
    }
  }
  for (const from of areas) {
    const distance = new Map([[key(from.destination),0]]), queue = [key(from.destination)];
    for (let i=0;i<queue.length;i++) for (const adjacent of lattice.get(queue[i])) {
      if (!distance.has(adjacent)) { distance.set(adjacent,distance.get(queue[i])+1);queue.push(adjacent); }
    }
    for (const to of areas) {
      let previous=from.destination,length=0;
      for(const point of routeThroughWalkGraph(previous,to.destination)) {
        length+=Math.abs(point.x-previous.x)+Math.abs(point.y-previous.y);previous=point;
      }
      assert.equal(length,distance.get(key(to.destination)),`${from.id} → ${to.id}`);
    }
  }
});

test('successful snapshot with invalid activity cannot make permanent warning activity', () => {
  const state = normalizePublicState(payload([entry({state:'warning',ttlSeconds:-1})]),epoch+3600001);
  assert.equal(state.primaryWorkflow,null);assert.equal(state.staleCount,1);
});

test('stop settles a superseded refresh even when the transport ignores abort', async () => {
  const h=harness();h.client.start();const refreshing=h.client.refresh();h.client.stop();
  await refreshing;assert.equal(h.jobs.size,0);assert.equal(h.states.length,0);
});

test('malformed entries in a successful response retain the last valid snapshot', async () => {
  const h=harness();h.client.start();await h.respond(0,payload());h.client.refresh();
  await h.respond(1,payload([entry({state:'unrecognized'})],epoch+100));
  assert.equal(h.statuses.at(-1).status,'offline');assert.equal(h.states.at(-1).activeWorkflows.length,1);
  h.client.destroy();
});
