import test from 'node:test';
import assert from 'node:assert/strict';

import { BOARD_CONTROL_FIELDS, planBoardGpioAssignment, routeWiringRunToPin } from './gpioAssignments.js';
import { compileWiring } from './wiringCompiler.js';

const outputs = [{ id: 'out1', pin: 16 }, { id: 'out2', pin: 17 }];
const controls = {
  encoder: { a: 4, b: 5, press: 0, alternatePress: 6 },
  previous: 7, next: 8, blackout: 9, brightness: -1, statusLed: 2,
};

test('board GPIO planner updates outputs and nested controls without mutating input', () => {
  const outputPlan = planBoardGpioAssignment({ outputs, controls, target: { kind: 'output', id: 'out1' }, pin: 38, supportedOutputPins: [16, 17, 38] });
  assert.equal(outputPlan.ok, true);
  assert.equal(outputPlan.outputs[0].pin, 38);
  assert.equal(outputs[0].pin, 16);
  const controlPlan = planBoardGpioAssignment({ outputs, controls, target: { kind: 'control', key: 'encoderA' }, pin: 10, supportedOutputPins: [16, 17, 38] });
  assert.equal(controlPlan.ok, true);
  assert.equal(controlPlan.controls.encoder.a, 10);
  assert.equal(controls.encoder.a, 4);
  assert.equal(BOARD_CONTROL_FIELDS.length, 9);
});

test('board GPIO planner rejects duplicate active pins and invalid ranges', () => {
  const duplicateOutput = planBoardGpioAssignment({ outputs, controls, target: { kind: 'output', id: 'out2' }, pin: 16, supportedOutputPins: [16, 17, 38] });
  assert.equal(duplicateOutput.ok, false);
  assert.match(duplicateOutput.error, /already assigned/i);
  const duplicateControl = planBoardGpioAssignment({ outputs, controls, target: { kind: 'control', key: 'previous' }, pin: 16, supportedOutputPins: [16, 17, 38] });
  assert.equal(duplicateControl.ok, false);
  assert.match(duplicateControl.error, /already assigned/i);
  assert.equal(planBoardGpioAssignment({ outputs, controls, target: { kind: 'control', key: 'brightness' }, pin: -1 }).ok, true);
  assert.equal(planBoardGpioAssignment({ outputs, controls, target: { kind: 'control', key: 'brightness' }, pin: 49 }).ok, false);
});

test('split physical runs can route to three separate GPIO outputs', () => {
  const strip = { id: 'ribbon', pixelCount: 9, pixels: Array.from({ length: 9 }, (_, x) => ({ x, y: 0 })) };
  const wiring = {
    version: 1, locked: false, verified: false,
    outputs: [{ id: 'out1', name: 'Output 1', pin: 16, runIds: ['a', 'b', 'c'] }],
    runs: [
      { id: 'a', type: 'strip', source: { stripId: 'ribbon', from: 0, to: 2 } },
      { id: 'b', type: 'strip', source: { stripId: 'ribbon', from: 3, to: 5 } },
      { id: 'c', type: 'strip', source: { stripId: 'ribbon', from: 6, to: 8 } },
    ],
  };
  const first = routeWiringRunToPin(wiring, { runId: 'b', pin: 17, controls, strips: [strip], supportedOutputPins: [16, 17, 18], maxOutputs: 4 });
  assert.equal(first.ok, true);
  const second = routeWiringRunToPin(first.wiring, { runId: 'c', pin: 18, controls, strips: [strip], supportedOutputPins: [16, 17, 18], maxOutputs: 4 });
  assert.equal(second.ok, true);
  assert.deepEqual(second.wiring.outputs.map(output => [output.pin, output.runIds]), [[16, ['a']], [17, ['b']], [18, ['c']]]);
  const compiled = compileWiring({ wiring: second.wiring, strips: [strip] });
  assert.equal(compiled.ok, true);
  assert.deepEqual(compiled.outputs.map(output => [output.pin, output.pixels]), [[16, 3], [17, 3], [18, 3]]);
  assert.equal(compiled.totalPixels, 9);
});
