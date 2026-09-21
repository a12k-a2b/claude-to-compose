/**
 * tests/unit/extractor.test.js
 * Comprehensive unit tests for Milestone M1 extractor components.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const { SvgParser } = require('../../extractor/svg_parser');
const { SpecBuilder } = require('../../extractor/spec_builder');
const { EphemeralServer, ExtractionEngine } = require('../../extractor/engine');

describe('SvgParser Unit Tests', () => {
  test('parses standard inline SVG paths and resolves viewBox', () => {
    const rawSvg = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="#4F46E5"/></svg>';
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.viewBox, '0 0 24 24');
    assert.equal(parsed.width, 24);
    assert.equal(parsed.height, 24);
    assert.equal(parsed.paths.length, 1);
    assert.equal(parsed.paths[0].d, 'M12 2L2 7l10 5 10-5-10-5z');
    assert.equal(parsed.paths[0].fill, '#4F46E5');
  });

  test('normalizes primitive SVG shapes into valid paths', () => {
    const rawSvg = `
      <svg width="48" height="48">
        <circle cx="24" cy="24" r="10" fill="#10B981" />
        <rect x="4" y="4" width="20" height="20" rx="4" stroke="#4F46E5" stroke-width="2" />
        <line x1="0" y1="0" x2="48" y2="48" stroke="#000000" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.viewBox, '0 0 48 48');
    assert.equal(parsed.paths.length, 3);
    assert.match(parsed.paths[0].d, /^M\s+14,24/); // Circle converted to path
    assert.match(parsed.paths[1].d, /^M\s+8,4/);  // Rounded rect converted to path
    assert.match(parsed.paths[2].d, /^M\s+0,0\s+L\s+48,48/); // Line converted to path
  });

  test('resolves currentColor against computedContext color', () => {
    const rawSvg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" stroke="currentColor" fill="none"/></svg>';
    const parsed = SvgParser.parseSvgString(rawSvg, { color: '#6366F1' });
    assert.equal(parsed.paths[0].stroke, '#6366F1');
  });

  test('extracts transform and fillRule attributes on SVG paths', () => {
    const rawSvg = '<svg width="20" height="20"><path d="M 0 0 L 10 10" fill="#000" fill-rule="evenodd" transform="matrix(1 0 0 1 11.250 10)"/></svg>';
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    assert.equal(parsed.paths[0].transform, 'matrix(1 0 0 1 11.250 10)');
    assert.equal(parsed.paths[0].fillRule, 'evenodd');
  });

  test('parseTransform decomposes affine transform strings', () => {
    const matrix = SvgParser.parseTransform('matrix(1 0 0 1 11.250 10)');
    assert.equal(matrix.type, 'matrix');
    assert.equal(matrix.translationX, 11.25);
    assert.equal(matrix.translationY, 10);
    assert.equal(matrix.scaleX, 1);
    assert.equal(matrix.scaleY, 1);
    assert.equal(matrix.hasTranslation, true);

    const translate = SvgParser.parseTransform('translate(14.5, 22.0)');
    assert.equal(translate.type, 'translate');
    assert.equal(translate.translationX, 14.5);
    assert.equal(translate.translationY, 22);

    const scale = SvgParser.parseTransform('scale(2, 3)');
    assert.equal(scale.type, 'scale');
    assert.equal(scale.scaleX, 2);
    assert.equal(scale.scaleY, 3);

    const rotate = SvgParser.parseTransform('rotate(45, 12, 12)');
    assert.equal(rotate.type, 'rotate');
    assert.equal(rotate.rotate, 45);
    assert.equal(rotate.pivotX, 12);
    assert.equal(rotate.pivotY, 12);
  });
});

describe('SpecBuilder & Schema Validation Unit Tests', () => {
  test('validates fully assembled specification against Draft 2020-12 schema', () => {
    const builder = new SpecBuilder();
    const sampleHierarchy = {
      id: 'node_root',
      type: 'SCREEN',
      componentType: 'Screen',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block', padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      children: [
        {
          id: 'node_btn',
          type: 'BUTTON',
          componentType: 'Button',
          bounds: { x: 20, y: 100, width: 140, height: 44 },
          layout: { display: 'flex', padding: { top: 10, right: 16, bottom: 10, left: 16 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          style: { backgroundColor: '#4F46E5', color: '#FFFFFF' },
          text: { content: 'Deploy Now', fontSize: 14, fontWeight: 600 }
        }
      ]
    };

    const spec = builder.buildSpec({
      metadata: { title: 'Unit Test Dashboard', source: 'local' },
      viewports: {
        mobile: { width: 390, height: 844, deviceScaleFactor: 3, screenshotPath: 'screenshots/mobile_reference.png' },
        desktop: { width: 1440, height: 900, deviceScaleFactor: 2, screenshotPath: 'screenshots/desktop_reference.png' }
      },
      domHierarchy: sampleHierarchy,
      vectorAssets: []
    });

    const validation = builder.validate(spec);
    assert.equal(validation.valid, true, `Validation errors: ${validation.errors?.join(', ')}`);
  });

  test('rejects specification missing required top-level sections', () => {
    const builder = new SpecBuilder();
    const invalidSpec = {
      version: '1.0.0',
      metadata: { title: 'Broken Spec' }
      // Missing theme, viewports, hierarchy
    };
    const validation = builder.validate(invalidSpec);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.length > 0);
  });

  test('extracts chromatic brand primary color over frequent neutral text grays', () => {
    const builder = new SpecBuilder();
    const children = [];
    // 50 neutral gray text nodes
    for (let i = 0; i < 50; i++) {
      children.push({
        id: `node_text_${i}`,
        type: 'TEXT',
        componentType: 'Text',
        bounds: { x: 0, y: i * 20, width: 200, height: 18 },
        layout: { display: 'block' },
        style: { color: '#6B7280' },
        text: { content: `Paragraph item ${i}`, fontSize: 14, fontWeight: 400 }
      });
    }
    // 2 brand primary buttons
    for (let i = 0; i < 2; i++) {
      children.push({
        id: `node_btn_${i}`,
        type: 'BUTTON',
        componentType: 'Button',
        bounds: { x: 10, y: 1000 + i * 50, width: 120, height: 40 },
        layout: { display: 'flex' },
        style: { backgroundColor: '#4F46E5', color: '#FFFFFF' },
        text: { content: 'Action Button', fontSize: 14, fontWeight: 600 }
      });
    }

    const hierarchy = {
      id: 'node_root',
      type: 'SCREEN',
      componentType: 'Screen',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block' },
      children
    };

    const spec = builder.buildSpec({
      metadata: { title: 'Brand Color Test' },
      viewports: {},
      domHierarchy: hierarchy,
      vectorAssets: []
    });

    assert.equal(spec.theme.colors.primary, '#4F46E5');
    assert.notEqual(spec.theme.colors.primary, '#6B7280');
  });

  test('synthesizes dynamic corner radii from DOM values', () => {
    const builder = new SpecBuilder();
    const hierarchy = {
      id: 'node_root',
      type: 'SCREEN',
      componentType: 'Screen',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block' },
      children: [
        {
          id: 'node_card',
          type: 'CARD',
          componentType: 'Card',
          bounds: { x: 10, y: 10, width: 300, height: 150 },
          layout: { display: 'block' },
          style: { borderRadius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 } }
        },
        {
          id: 'node_modal',
          type: 'CONTAINER',
          componentType: 'Container',
          bounds: { x: 10, y: 180, width: 300, height: 150 },
          layout: { display: 'block' },
          style: { borderRadius: 12 }
        },
        {
          id: 'node_sheet',
          type: 'CONTAINER',
          componentType: 'Container',
          bounds: { x: 10, y: 350, width: 300, height: 150 },
          layout: { display: 'block' },
          style: { borderRadius: 20 }
        }
      ]
    };

    const spec = builder.buildSpec({
      metadata: { title: 'Radii Test' },
      viewports: {},
      domHierarchy: hierarchy,
      vectorAssets: []
    });

    assert.equal(spec.theme.radii.small, 6);
    assert.equal(spec.theme.radii.medium, 12);
    assert.equal(spec.theme.radii.large, 20);
  });

  test('synthesizes dynamic typography font family and supports RadioButton componentType', () => {
    const builder = new SpecBuilder();
    const hierarchy = {
      id: 'node_root',
      type: 'SCREEN',
      componentType: 'Screen',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block' },
      children: [
        {
          id: 'node_radio',
          type: 'RADIOBUTTON',
          componentType: 'RadioButton',
          bounds: { x: 20, y: 20, width: 24, height: 24 },
          layout: { display: 'block' },
          style: { color: '#2563EB' }
        },
        {
          id: 'node_label',
          type: 'TEXT',
          componentType: 'Text',
          bounds: { x: 50, y: 20, width: 150, height: 24 },
          layout: { display: 'block' },
          text: { content: 'Option 1', fontFamily: 'Poppins', fontSize: 16, fontWeight: 500 }
        }
      ]
    };

    const spec = builder.buildSpec({
      metadata: { title: 'Typography and Radio Test' },
      viewports: {},
      domHierarchy: hierarchy,
      vectorAssets: []
    });

    assert.equal(spec.theme.typography.fontFamily, 'Poppins');
    assert.equal(spec.theme.typography.styles.bodyLarge.fontFamily, 'Poppins');
    const val = builder.validate(spec);
    assert.equal(val.valid, true, `Validation failed: ${val.errors?.join(', ')}`);
  });
});

describe('EphemeralServer Unit Tests', () => {
  test('serves local fixture file over HTTP with valid CORS headers', async () => {
    const fixturePath = path.resolve(__dirname, '../../fixtures/sample_dashboard.html');
    const server = new EphemeralServer(fixturePath, false);
    const serverUrl = await server.start();

    try {
      assert.match(serverUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);

      const resp = await new Promise((resolve, reject) => {
        http.get(serverUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          }));
        }).on('error', reject);
      });

      assert.equal(resp.statusCode, 200);
      assert.equal(resp.headers['access-control-allow-origin'], '*');
      assert.match(resp.headers['content-type'], /text\/html/);
      assert.ok(resp.body.includes('Nexus Cloud'));
    } finally {
      await server.stop();
    }
  });
});

describe('ExtractionEngine Unit Tests', () => {
  test('resolves Chromium executable from cache or environment', () => {
    const engine = new ExtractionEngine();
    const execPath = engine.resolveChromiumBinary();
    assert.ok(typeof execPath === 'string' && fs.existsSync(execPath), `Expected valid binary path, got: ${execPath}`);
    assert.ok(execPath.includes('Google Chrome for Testing') || execPath.includes('chrome'));
  });
});

const { classifyComponent } = require('../../extractor/dom_walker');
const { generateScreenFile } = require('../../synthesizer/screen_generator');

describe('Subsystem Integration & Advanced Component Classification', () => {
  test('SpecBuilder validates specs with Toolbar, Overlay, and Dialog against Draft 2020-12 schema', () => {
    const builder = new SpecBuilder();
    const hierarchy = {
      id: 'root',
      type: 'SCREEN',
      componentType: 'Screen',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block' },
      children: [
        {
          id: 'node_toolbar',
          type: 'TOOLBAR',
          componentType: 'Toolbar',
          bounds: { x: 0, y: 0, width: 390, height: 48 },
          layout: { display: 'flex' },
          children: []
        },
        {
          id: 'node_overlay',
          type: 'OVERLAY',
          componentType: 'Overlay',
          bounds: { x: 0, y: 0, width: 390, height: 844 },
          layout: { display: 'block' },
          children: []
        },
        {
          id: 'node_dialog',
          type: 'DIALOG',
          componentType: 'Dialog',
          bounds: { x: 20, y: 200, width: 350, height: 200 },
          layout: { display: 'block' },
          children: []
        }
      ]
    };

    const spec = builder.buildSpec({
      metadata: { title: 'Toolbar and Overlay Spec' },
      viewports: {},
      domHierarchy: hierarchy,
      vectorAssets: []
    });

    const validation = builder.validate(spec);
    assert.equal(validation.valid, true, `Validation errors: ${validation.errors?.join(', ')}`);
  });

  test('ScreenGenerator transpiles Toolbar and Overlay into valid Compose layouts', () => {
    const spec = {
      metadata: { title: 'Test Toolbar Screen' },
      theme: { colors: {}, typography: { styles: {} } },
      viewports: {},
      hierarchy: {
        id: 'screen_root',
        type: 'SCREEN',
        componentType: 'Screen',
        bounds: { x: 0, y: 0, width: 390, height: 844 },
        layout: { display: 'block' },
        children: [
          {
            id: 'tools',
            type: 'TOOLBAR',
            componentType: 'Toolbar',
            bounds: { x: 0, y: 0, width: 390, height: 48 },
            children: [
              {
                id: 'tool_btn',
                type: 'BUTTON',
                componentType: 'Button',
                text: { content: 'Action' }
              }
            ]
          },
          {
            id: 'modal_dialog',
            type: 'OVERLAY',
            componentType: 'Overlay',
            bounds: { x: 0, y: 0, width: 390, height: 844 },
            children: [
              {
                id: 'dialog_text',
                type: 'TEXT',
                componentType: 'Text',
                text: { content: 'Dialog Notice' }
              }
            ]
          }
        ]
      }
    };

    const kotlin = generateScreenFile(spec, 'com.claude.compose');
    assert.ok(kotlin.includes('Arrangement.spacedBy(8.dp)'), 'Toolbar must use spacedBy(8.dp)');
    assert.ok(kotlin.includes('background(Color(0x66000000))'), 'Overlay must have semi-transparent backdrop');
    assert.ok(kotlin.includes('AppCard(modifier = Modifier.padding(24.dp))'), 'Overlay must wrap content in AppCard');
  });

  test('dom_walker classifies elements with aria-label / id / role of toolbar and dialog / overlay', () => {
    // Toolbar heuristics
    assert.equal(classifyComponent({ tagName: 'div', role: 'toolbar' }), 'Toolbar');
    assert.equal(classifyComponent({ tagName: 'div', className: 'editor-toolbar-container' }), 'Toolbar');
    assert.equal(classifyComponent({ tagName: 'div', id: 'main-toolbar' }), 'Toolbar');
    assert.equal(classifyComponent({ tagName: 'div', ariaLabel: 'formatting toolbar' }), 'Toolbar');

    // Overlay / Dialog heuristics
    assert.equal(classifyComponent({ tagName: 'dialog' }), 'Overlay');
    assert.equal(classifyComponent({ tagName: 'div', role: 'dialog' }), 'Overlay');
    assert.equal(classifyComponent({ tagName: 'div', className: 'modal-backdrop' }), 'Overlay');
    assert.equal(classifyComponent({ tagName: 'div', id: 'confirm-dialog' }), 'Overlay');
    assert.equal(classifyComponent({ tagName: 'div', ariaLabel: 'alert dialog' }), 'Overlay');
  });
});
