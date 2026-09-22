'use strict';

/**
 * src/hardware/fleet_manager.js
 *
 * Daylight DC1 Tablet Fleet Discovery and Concurrency Lease Manager.
 * Queries connected Daylight Computer tablets ('rooted 3' = JMBR00380, 'rooted 4' = JMBR00405),
 * filters out emulators and non-DC1 devices, checks battery/power state,
 * and manages exclusive concurrency leases across multiple agent threads.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DC1_KNOWN_DEVICES = Object.freeze({
  'rooted 3': { serial: 'JMBR00380', alias: 'rooted 3', model: 'DC_1', product: 'vext_jagar' },
  'rooted 4': { serial: 'JMBR00405', alias: 'rooted 4', model: 'DC_1', product: 'vext_jagar' },
  'JMBR00380': { serial: 'JMBR00380', alias: 'rooted 3', model: 'DC_1', product: 'vext_jagar' },
  'JMBR00405': { serial: 'JMBR00405', alias: 'rooted 4', model: 'DC_1', product: 'vext_jagar' }
});

const DC1_SERIAL_PATTERN = /^JMBR[0-9]{5}$/;
const MIN_BATTERY_PERCENT = 15;
const LEASE_DIR = path.resolve(__dirname, '../../.ctc/leases');

class FleetManager {
  constructor(options = {}) {
    this.leaseDir = options.leaseDir || LEASE_DIR;
    this.inMemoryLeases = new Map();
    this._ensureLeaseDir();
  }

  _ensureLeaseDir() {
    try {
      if (!fs.existsSync(this.leaseDir)) {
        fs.mkdirSync(this.leaseDir, { recursive: true });
      }
    } catch (_) {
      // Non-fatal if filesystem is read-only; falls back to in-memory leases
    }
  }

  /**
   * Checks whether a device identifier is a Daylight DC1 tablet.
   * Filters out emulators (e.g. emulator-5554) and non-DC1 devices.
   * @param {string} identifier
   * @returns {boolean}
   */
  isDc1Device(identifier) {
    if (!identifier) return false;
    if (identifier.startsWith('emulator-')) return false;
    if (DC1_KNOWN_DEVICES[identifier]) return true;
    return DC1_SERIAL_PATTERN.test(identifier);
  }

  /**
   * Resolves an alias or serial to the canonical serial number.
   * @param {string} identifier
   * @returns {string|null}
   */
  resolveSerial(identifier) {
    if (!identifier) return null;
    if (DC1_KNOWN_DEVICES[identifier]) {
      return DC1_KNOWN_DEVICES[identifier].serial;
    }
    if (DC1_SERIAL_PATTERN.test(identifier)) {
      return identifier;
    }
    return null;
  }

  /**
   * Resolves a serial to an alias if known.
   * @param {string} serial
   * @returns {string}
   */
  resolveAlias(serial) {
    if (serial === 'JMBR00380') return 'rooted 3';
    if (serial === 'JMBR00405') return 'rooted 4';
    return serial;
  }

  /**
   * Queries connected devices using ADB and discovers DC1 fleet tablets.
   * Emulators and foreign devices are strictly excluded.
   * @returns {Array<object>} List of discovered DC1 devices
   */
  discoverFleet() {
    const devices = [];
    let adbOutput = '';

    try {
      adbOutput = execSync('adb devices -l', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      return devices;
    }

    const lines = adbOutput.split('\n').filter(l => l.trim() && !l.startsWith('List of'));

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const serial = parts[0];
      const state = parts[1];

      // Exclude emulators and non-DC1 serials
      if (!this.isDc1Device(serial)) {
        continue;
      }

      if (state !== 'device') {
        continue;
      }

      const alias = this.resolveAlias(serial);
      const batteryLevel = this._getBatteryLevel(serial);
      const isRootAvailable = this._checkRootAvailable(serial);
      const leaseStatus = this.checkLease(serial);

      devices.push({
        alias,
        serial,
        model: 'DC_1',
        product: 'vext_jagar',
        displayTechnology: 'Transflective / Reflective LCD (LivePaper)',
        state,
        batteryLevel,
        isBatterySafe: batteryLevel >= MIN_BATTERY_PERCENT,
        isRootAvailable,
        locked: leaseStatus.locked,
        leaseOwner: leaseStatus.owner
      });
    }

    return devices;
  }

  /**
   * Retrieves battery percentage for a device.
   * @param {string} serial
   * @returns {number}
   */
  _getBatteryLevel(serial) {
    try {
      const out = execSync(`adb -s ${serial} shell dumpsys battery`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 3000
      });
      const match = out.match(/level:\s*(\d+)/);
      return match ? parseInt(match[1], 10) : 100;
    } catch (_) {
      return 100;
    }
  }

  /**
   * Checks if root is available via `su 0`.
   * @param {string} serial
   * @returns {boolean}
   */
  _checkRootAvailable(serial) {
    try {
      const out = execSync(`adb -s ${serial} shell "su 0 id"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 3000
      });
      return out.includes('uid=0(root)');
    } catch (_) {
      return false;
    }
  }

  /**
   * Checks whether a device currently has an active lease.
   * @param {string} identifier
   * @returns {{ locked: boolean, owner: string|null }}
   */
  checkLease(identifier) {
    const serial = this.resolveSerial(identifier) || identifier;

    // Check in-memory lease
    if (this.inMemoryLeases.has(serial)) {
      const lease = this.inMemoryLeases.get(serial);
      if (Date.now() - lease.timestamp < 120000) { // 2 minute timeout
        return { locked: true, owner: lease.owner, pid: lease.pid };
      } else {
        this.inMemoryLeases.delete(serial);
      }
    }

    // Check filesystem lease
    const leaseFile = path.join(this.leaseDir, `${serial}.lease`);
    if (fs.existsSync(leaseFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
        const ageMs = Date.now() - (data.timestamp || 0);
        if (ageMs < 120000) {
          return { locked: true, owner: data.owner, pid: data.pid };
        } else {
          // Stale lease file
          try { fs.unlinkSync(leaseFile); } catch (_) {}
        }
      } catch (_) {}
    }

    return { locked: false, owner: null };
  }

  /**
   * Acquires an exclusive concurrency lease on a DC1 device.
   * If preferredIdentifier is provided, attempts to acquire that device.
   * Otherwise, chooses the first available DC1 device with safe battery.
   * @param {string} [preferredIdentifier]
   * @param {string} [owner='ctc_agent']
   * @returns {object} Acquired device descriptor
   * @throws {Error} If no device is available or battery is low
   */
  acquireDevice(preferredIdentifier = null, owner = `agent_${process.pid}`) {
    const fleet = this.discoverFleet();
    if (fleet.length === 0) {
      throw new Error('No Daylight Computer (DC1) tablets connected. Connect rooted 3 (JMBR00380) or rooted 4 (JMBR00405).');
    }

    let candidate = null;

    if (preferredIdentifier) {
      const serial = this.resolveSerial(preferredIdentifier);
      candidate = fleet.find(d => d.serial === serial || d.alias === preferredIdentifier);
      if (!candidate) {
        throw new Error(`Specified device "${preferredIdentifier}" is not connected in the DC1 fleet.`);
      }
    } else {
      // Find first unlocked device with safe battery
      candidate = fleet.find(d => !d.locked && d.isBatterySafe);
      if (!candidate) {
        // Fallback to any unlocked device
        candidate = fleet.find(d => !d.locked);
      }
    }

    if (!candidate) {
      throw new Error('All connected Daylight Computer (DC1) tablets are currently locked by other agent leases.');
    }

    if (candidate.batteryLevel < MIN_BATTERY_PERCENT) {
      throw new Error(`Device ${candidate.alias} (${candidate.serial}) battery too low (${candidate.batteryLevel}% < ${MIN_BATTERY_PERCENT}% threshold) to safely run hardware qualification.`);
    }

    // Check if already locked by someone else
    const lease = this.checkLease(candidate.serial);
    if (lease.locked && lease.pid !== process.pid) {
      throw new Error(`Device ${candidate.alias} (${candidate.serial}) is locked by active lease (owner: ${lease.owner}, pid: ${lease.pid}).`);
    }

    // Set lease
    const leaseData = {
      serial: candidate.serial,
      alias: candidate.alias,
      owner,
      pid: process.pid,
      timestamp: Date.now()
    };

    this.inMemoryLeases.set(candidate.serial, leaseData);

    try {
      const leaseFile = path.join(this.leaseDir, `${candidate.serial}.lease`);
      fs.writeFileSync(leaseFile, JSON.stringify(leaseData, null, 2));
    } catch (_) {}

    return {
      ...candidate,
      locked: true,
      leaseOwner: owner
    };
  }

  /**
   * Releases a lease on a device.
   * @param {string} identifier
   */
  releaseDevice(identifier) {
    const serial = this.resolveSerial(identifier) || identifier;
    this.inMemoryLeases.delete(serial);

    try {
      const leaseFile = path.join(this.leaseDir, `${serial}.lease`);
      if (fs.existsSync(leaseFile)) {
        fs.unlinkSync(leaseFile);
      }
    } catch (_) {}
  }
}

module.exports = {
  FleetManager,
  DC1_KNOWN_DEVICES,
  DC1_SERIAL_PATTERN,
  MIN_BATTERY_PERCENT
};
