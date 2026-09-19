/**
 * Tier 1 - Feature 7: design_spec.json Schema Validation
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 12
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F7: design_spec.json Schema Validation',
  tier: 1,
  feature: 'F7',
  tests: [
    {
      id: 'T1_F7_01',
      name: 'Verify fixture design_spec.json contains all mandatory top-level sections',
      run: async (t) => {
        const specPath = path.join(t.fixturesDir, 'assets', 'test_spec.json');
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const requiredSections = ['metadata', 'viewports', 'theme', 'hierarchy', 'vectors'];
        for (const section of requiredSections) {
          t.assert(section in spec, `design_spec.json must contain "${section}" section`);
        }
      }
    },
    {
      id: 'T1_F7_02',
      name: 'Validate theme tokens structure in design_spec.json (colors, typography, spacing, radii, elevations)',
      run: async (t) => {
        const specPath = path.join(t.fixturesDir, 'assets', 'test_spec.json');
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const theme = spec.theme;
        t.assert(theme.colors && typeof theme.colors === 'object', 'Theme must contain colors');
        t.assert(theme.typography && typeof theme.typography === 'object', 'Theme must contain typography');
        t.assert(theme.spacing && typeof theme.spacing === 'object', 'Theme must contain spacing');
        t.assert(theme.radii && typeof theme.radii === 'object', 'Theme must contain radii');
        t.assert(theme.elevations && typeof theme.elevations === 'object', 'Theme must contain elevations');
      }
    },
    {
      id: 'T1_F7_03',
      name: 'Validate hierarchy root node schema and required attributes',
      run: async (t) => {
        const specPath = path.join(t.fixturesDir, 'assets', 'test_spec.json');
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const root = spec.hierarchy;
        t.assert(root.id, 'Hierarchy node must have an id');
        t.assert(root.type, 'Hierarchy node must have a type (e.g. CONTAINER)');
        t.assert(root.layout, 'Hierarchy node must have a layout object');
        t.assert(Array.isArray(root.children), 'Hierarchy node must have children array');
      }
    },
    {
      id: 'T1_F7_04',
      name: 'Verify spec_builder module existence in extractor subsystem',
      run: async (t) => {
        t.checkFileExists('extractor/spec_builder.js', 'M1', 'spec_builder module required to construct and validate design_spec.json');
      }
    },
    {
      id: 'T1_F7_05',
      name: 'Validate JSON Schema Draft 2020-12 identifier compliance',
      run: async (t) => {
        const specPath = path.join(t.fixturesDir, 'assets', 'test_spec.json');
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        t.assertEqual(spec.$schema, 'https://json-schema.org/draft/2020-12/schema');
      }
    }
  ]
};
