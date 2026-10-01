import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLivePreviewControlPayload } from './cardLiveControl.js';
test('installed brightness patch never selects a pattern, cancels streams or changes calibration',()=>assert.deepEqual(buildLivePreviewControlPayload({patternId:'sun',brightness:.4},{exactCardPatternId:'sun',installedControlPatch:true,expectedControlPatch:{brightness:.4}}),{brightness:.4}));
test('explicit installed pattern selection names its playback consequence',()=>assert.deepEqual(buildLivePreviewControlPayload({patternId:'sun'},{exactCardPatternId:'sun',installedControlPatch:true,expectedControlPatch:{patternId:'sun'}}),{patternId:'sun',cancelStream:true,syncZones:true}));
