import assert from 'node:assert/strict';
import test from 'node:test';
import { countUpValue } from './countUpValue';

test('fractional-cent wins never count above their award before completion', () => {
  assert.equal(countUpValue(.6, .875), .5);
  for (const award of [.0001, .01, .6, 1, 12345.6789, 166_660_000]) {
    let previous = 0;
    for (let frame = 0; frame <= 600; frame++) {
      const value = countUpValue(award, 1 - (1 - frame / 600) ** 3);
      assert(value >= previous, `Counter decreased at ${award}/${frame}`);
      assert(value <= award, `Counter exceeded award ${award}/${frame}`);
      previous = value;
    }
    assert.equal(previous, award);
  }
});

test('ordinary awards do not flash fractional cents during animation', () => {
  for (const award of [1, 15_00, 122_80, 1_666_600]) {
    for (let frame = 0; frame <= 200; frame++) {
      assert(Number.isInteger(countUpValue(award, frame / 200)));
    }
  }
  assert.equal(countUpValue(123.4567, 1), 123.4567);
});
