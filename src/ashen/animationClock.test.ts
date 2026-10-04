import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AnimationState, AnimationStateData, AtlasAttachmentLoader, Skeleton, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { AnimationClock, VisibleTimeline } from './animationClock';
import { beginCharacterGesture } from './characterMotion';
import { waitForPresentation } from './presentationClock';
import { AmbientBudget } from './ambientBudget';

test('ambient quality reacts to sustained pressure, ignores startup and recovers slowly',()=>{
  const budget=new AmbientBudget();
  for(let i=0;i<50;i++)budget.observe(.05);
  assert.equal(budget.tier,0,'initial asset preparation must not degrade the scene');
  for(let i=0;i<160;i++)budget.observe(.05);
  assert.equal(budget.tier,2,'sustained 20FPS pressure must lower only the ambient budget');
  for(let i=0;i<180;i++)budget.observe(1/60);
  assert.equal(budget.tier,2,'a brief quiet moment must not oscillate quality');
  budget.resetSamples();
  budget.observe(0);budget.observe(Number.NaN);
  assert.equal(budget.tier,2,'visibility reset keeps the selected quality');
  for(let i=0;i<2400;i++)budget.observe(1/60);
  assert.equal(budget.tier,0,'sustained headroom restores full atmosphere');
});

test('Spine clocks preserve elapsed visible time at 60, 20 and 10 FPS', () => {
  for (const fps of [60, 20, 10]) {
    const clock = new AnimationClock();
    let total = 0;
    for (let frame = 0; frame <= fps * 4; frame++) total += clock.next(frame * 1000 / fps);
    assert(Math.abs(total - 4) < 1e-10, `${fps} FPS lost animation time: ${total}`);
  }
});

test('visibility resets exclude time spent in another tab without adding a resume jump', () => {
  const clock = new AnimationClock();
  assert.equal(clock.next(0), 0);
  assert.equal(clock.next(25), .025);
  clock.reset();
  assert.equal(clock.next(30_000), 0);
  assert.equal(clock.next(30_025), .025);
});

test('bonus timeline keeps exact visible time across late frames and repeated off-frame pauses', () => {
  const clock = new VisibleTimeline(100);
  assert.equal(clock.seconds(610), .51);
  clock.setPaused(650, true);
  assert.equal(clock.seconds(5000), .55);
  clock.setPaused(5000, false);
  assert.equal(clock.seconds(5480), 1.03);
  clock.setPaused(5545, true);
  clock.setPaused(5548, true); // React's paused prop must not shift the tab boundary.
  assert.equal(clock.seconds(12_000), 1.095);
  clock.setPaused(12_000, false);
  clock.setPaused(12_006, false);
  assert.equal(clock.seconds(13_255), 2.35);
  assert.equal(clock.seconds(13_905), 3);
});

test('the authored character finishes its cast on time at low FPS', () => {
  const directory = new URL('../../public/ashen/', import.meta.url);
  const atlas = new TextureAtlas(readFileSync(new URL('character.atlas', directory), 'utf8'));
  const json = JSON.parse(readFileSync(new URL('character.json', directory), 'utf8'));
  const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json);
  for (const fps of [60, 20, 10]) {
    const state = new AnimationState(new AnimationStateData(data)), skeleton = new Skeleton(data), clock = new AnimationClock();
    state.setAnimation(0, 'idle', true);
    const track = beginCharacterGesture(state, 'cast', false);
    let completed = 0;
    state.addListener({ complete: entry => { if (entry === track) completed++; } });
    const duration = track.animation!.duration;
    const frames = Math.ceil(fps * (duration + .2));
    for (let frame = 0; frame <= frames; frame++) { state.update(clock.next(frame * 1000 / fps)); state.apply(skeleton); }
    assert.equal(completed, 1, `${fps} FPS did not complete the ${duration}-second gesture within its authored duration plus .2 seconds`);
    assert(Math.abs(state.getCurrent(0)!.trackTime - frames / fps) < 1e-10, `${fps} FPS lost elapsed visible time from the idle track`);
  }
});

test('presentation deadlines retain their remaining time across hidden tabs and clean up on abort', async t => {
  let now = 0, serial = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  class FakeDocument extends EventTarget { hidden = false; }
  const page = new FakeDocument();
  for (const [name, value] of Object.entries({ document: page, window: {
    setTimeout(callback: () => void, delay: number) { const id = ++serial; timers.set(id, { callback, delay }); return id; },
  } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name); });
  }
  t.mock.method(performance, 'now', () => now);
  t.mock.method(globalThis, 'clearTimeout', id => { timers.delete(Number(id)); });
  const controller = new AbortController();
  let complete = false;
  const waiting = waitForPresentation(1000, controller.signal).then(() => { complete = true; });
  assert.equal([...timers.values()][0].delay, 1000);
  now = 600; page.hidden = true; page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0);
  now = 20_000; page.hidden = false; page.dispatchEvent(new Event('visibilitychange'));
  assert.equal([...timers.values()][0].delay, 400);
  assert.equal(complete, false);
  [...timers.values()][0].callback();
  await waiting;
  assert.equal(complete, true);
  assert.equal(timers.size, 0);

  const cancelled = new AbortController();
  const cancellation = assert.rejects(waitForPresentation(1000, cancelled.signal), { name: 'AbortError' });
  cancelled.abort(); await cancellation;
  assert.equal(timers.size, 0);
  page.hidden = true; page.dispatchEvent(new Event('visibilitychange'));
  page.hidden = false; page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0, 'disposed waits must not restart on visibility changes');
});
