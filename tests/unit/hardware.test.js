'use strict';

/**
 * tests/unit/hardware.test.js
 *
 * Unit tests for Daylight Computer (DC1) Hardware Subsystem & Scenario Replay.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  FleetManager,
  McpBridge,
  Dc1Runner,
  DC1_LOGICAL_WIDTH,
  DC1_LOGICAL_HEIGHT,
  DC1_INSET_PX,
  MIN_BATTERY_PERCENT
} = require('../../src/hardware');

const { replayScenario, KEYCODES } = require('../../src/verification/stages/scenario_replay');

describe('DC1 Hardware Subsystem: FleetManager', () => {
  it('correctly identifies DC1 tablets and filters out emulators', () => {
    const fm = new FleetManager({ leaseDir: path.join(os.tmpdir(), `ctc_lease_test_${Date.now()}`) });

    assert.equal(fm.isDc1Device('rooted 3'), true);
    assert.equal(fm.isDc1Device('rooted 4'), true);
    assert.equal(fm.isDc1Device('JMBR00380'), true);
    assert.equal(fm.isDc1Device('JMBR00405'), true);
    assert.equal(fm.isDc1Device('JMBR99999'), true);

    // Rejects emulators and generic devices
    assert.equal(fm.isDc1Device('emulator-5554'), false);
    assert.equal(fm.isDc1Device('emulator-5556'), false);
    assert.equal(fm.isDc1Device('pixel_7_pro'), false);
    assert.equal(fm.isDc1Device(''), false);
    assert.equal(fm.isDc1Device(null), false);
  });

  it('resolves aliases and serials accurately', () => {
    const fm = new FleetManager();
    assert.equal(fm.resolveSerial('rooted 3'), 'JMBR00380');
    assert.equal(fm.resolveSerial('rooted 4'), 'JMBR00405');
    assert.equal(fm.resolveSerial('JMBR00380'), 'JMBR00380');

    assert.equal(fm.resolveAlias('JMBR00380'), 'rooted 3');
    assert.equal(fm.resolveAlias('JMBR00405'), 'rooted 4');
  });

  it('manages device leases in isolation', () => {
    const tmpLeaseDir = path.join(os.tmpdir(), `ctc_lease_test_${Date.now()}`);
    const fm = new FleetManager({ leaseDir: tmpLeaseDir });

    const statusBefore = fm.checkLease('JMBR00380');
    assert.equal(statusBefore.locked, false);

    // Simulate in-memory lease
    fm.inMemoryLeases.set('JMBR00380', {
      serial: 'JMBR00380',
      owner: 'test_runner',
      pid: process.pid,
      timestamp: Date.now()
    });

    const statusAfter = fm.checkLease('JMBR00380');
    assert.equal(statusAfter.locked, true);
    assert.equal(statusAfter.owner, 'test_runner');

    fm.releaseDevice('JMBR00380');
    assert.equal(fm.checkLease('JMBR00380').locked, false);
  });
});

describe('DC1 Hardware Subsystem: McpBridge', () => {
  it('maps logical 1184x1584 coordinates through +8px hardware inset', () => {
    const bridge = new McpBridge();
    const mapped = bridge.mapLogicalToPhysical(592.0, 792.0);

    assert.equal(mapped.physicalX, 600.0);
    assert.equal(mapped.physicalY, 800.0);
    assert.equal(mapped.clampedLogicalX, 592.0);
    assert.equal(mapped.clampedLogicalY, 792.0);
  });

  it('clamps coordinates to active logical display boundary [0, 1184] x [0, 1584]', () => {
    const bridge = new McpBridge();
    const clampedMax = bridge.mapLogicalToPhysical(2000.0, 3000.0);

    assert.equal(clampedMax.clampedLogicalX, DC1_LOGICAL_WIDTH);
    assert.equal(clampedMax.clampedLogicalY, DC1_LOGICAL_HEIGHT);
    assert.equal(clampedMax.physicalX, DC1_LOGICAL_WIDTH + DC1_INSET_PX);
    assert.equal(clampedMax.physicalY, DC1_LOGICAL_HEIGHT + DC1_INSET_PX);

    const clampedMin = bridge.mapLogicalToPhysical(-50.0, -100.0);
    assert.equal(clampedMin.clampedLogicalX, 0);
    assert.equal(clampedMin.clampedLogicalY, 0);
    assert.equal(clampedMin.physicalX, DC1_INSET_PX);
    assert.equal(clampedMin.physicalY, DC1_INSET_PX);
  });
});

describe('DC1 Hardware Subsystem: Dc1Runner Target Resolution', () => {
  it('prioritizes retrofit pilot app fixtures/note-app', () => {
    const runner = new Dc1Runner();
    const target = runner.resolveTargetApp();

    assert.ok(target.packageName.includes('com.claude.noteapp') || target.packageName.includes('com.claude.compose'));
    assert.equal(target.activityName, '.MainActivity');
  });
});

describe('Verification Stages: Scenario Replay', () => {
  it('successfully executes authentic KEYCODE_BACK navigation replay', async () => {
    const result = await replayScenario({
      screenId: 'note_editor',
      initialRoute: 'note_editor/1',
      backstack: ['notes_list', 'note_editor/1'],
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', keyEventCode: 4, latencyMs: 8.5 },
      expectedDestination: 'notes_list',
      expectedNavigationEffect: 'POP_BACK',
      verifyStatePreserved: true,
      settleMs: 150
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.success, true);
    assert.equal(result.backstackPopped, true);
    assert.equal(result.currentRoute, 'notes_list');
    assert.equal(result.statePreserved, true);
    assert.equal(result.epdWaveformsDetected, false);
    assert.ok(result.latencyMs < 16.0);
  });

  it('vetoes replay if key event latency exceeds sub-frame threshold (>= 16ms)', async () => {
    const result = await replayScenario({
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', latencyMs: 25.0 }
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.errorCode, 'LATENCY_THRESHOLD_EXCEEDED');
  });

  it('vetoes replay if EPD workaround is detected in source', async () => {
    const result = await replayScenario({
      sourceCode: 'context.sendBroadcast(Intent("ACTION_REFRESH_SCREEN"))'
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.errorCode, 'EPD_WORKAROUND_VIOLATION');
    assert.equal(result.epdWaveformsDetected, true);
  });

  it('vetoes replay if settle time violates fluid LivePaper standard (e.g. 600ms artificial pause)', async () => {
    const result = await replayScenario({
      settleMs: 600
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.errorCode, 'EPD_WORKAROUND_VIOLATION');
  });
});
