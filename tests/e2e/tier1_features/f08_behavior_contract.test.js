'use strict';

/**
 * tests/e2e/tier1_features/f08_behavior_contract.test.js
 * Feature 8: Layer 3 Behavior Contract IR (`behavior-contract.json`)
 */

module.exports = {
  name: 'Feature 08: Layer 3 Behavior Contract IR (behavior-contract.json)',
  tests: [
    {
      id: 'F08-T1',
      name: 'Behavior contract schema definition exists and enforces Draft 2020-12',
      fn(t) {
        t.checkComponent('Behavior Contract Schema', 'M2', () => {
          t.checkFileExists('src/contract/schemas/behavior_contract.json', 'M2');
          const schema = require('../../../src/contract/schemas/behavior_contract.json');
          t.assert(schema.$schema && schema.$schema.includes('2020-12'));
          t.assertEqual(schema.title, 'BehaviorContractSpecification');
        });
      }
    },
    {
      id: 'F08-T2',
      name: 'Behavior contract models state variables and hoisted bindings',
      fn(t) {
        t.checkComponent('State Variables Modeling', 'M2', () => {
          const builder = require('../../../src/contract/behavior_contract_builder');
          const contract = builder.createBehaviorContract({
            screenId: 'note_editor',
            stateVariables: [
              { name: 'titleText', type: 'String', defaultValue: '', isHoisted: true, preservationRequired: true }
            ]
          });
          t.assert(contract.stateVariables.length === 1);
          t.assertEqual(contract.stateVariables[0].isHoisted, true);
        });
      }
    },
    {
      id: 'F08-T3',
      name: 'Behavior contract models state machine transitions (t0 -> t1 -> t2)',
      fn(t) {
        t.checkComponent('State Transitions Modeling', 'M2', () => {
          const builder = require('../../../src/contract/behavior_contract_builder');
          const contract = builder.createBehaviorContract({
            transitions: [
              {
                fromState: 'DEFAULT',
                toState: 'SAVED',
                triggerEvent: { eventType: 'TAP', targetSourceId: 'daylight#note_editor/save_btn' },
                appAction: { actionName: 'saveNote' }
              }
            ]
          });
          t.assertEqual(contract.transitions[0].toState, 'SAVED');
          t.assertEqual(contract.transitions[0].triggerEvent.eventType, 'TAP');
        });
      }
    },
    {
      id: 'F08-T4',
      name: 'Behavior contract models navigation side-effects and dialog transitions',
      fn(t) {
        t.checkComponent('Navigation Side-Effects', 'M2', () => {
          const builder = require('../../../src/contract/behavior_contract_builder');
          const contract = builder.createBehaviorContract({
            transitions: [
              {
                fromState: 'EDITING',
                toState: 'DISMISSED',
                triggerEvent: { eventType: 'TAP', targetSourceId: 'daylight#note_editor/back_btn' },
                navigationEffect: { type: 'POP_BACK' }
              }
            ]
          });
          t.assertEqual(contract.transitions[0].navigationEffect.type, 'POP_BACK');
        });
      }
    },
    {
      id: 'F08-T5',
      name: 'Behavior contract records deterministic replay checkpoints',
      fn(t) {
        t.checkComponent('Replay Checkpoints', 'M2', () => {
          const builder = require('../../../src/contract/behavior_contract_builder');
          const contract = builder.createBehaviorContract({
            checkpoints: [
              { id: 'cp_01_init', timestampMs: 0, state: { titleText: '' } },
              { id: 'cp_02_settled', timestampMs: 150, state: { titleText: 'My Note' } }
            ]
          });
          t.assertEqual(contract.checkpoints.length, 2);
          t.assertEqual(contract.checkpoints[1].timestampMs, 150);
        });
      }
    }
  ]
};
