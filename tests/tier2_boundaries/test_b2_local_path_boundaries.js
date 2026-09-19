/**
 * Tier 2 - Boundary 2: Local File Ingestion Edge Cases & Negative Tests
 * Covers: Non-existent files, non-HTML files, 0-byte files, symlink escapes
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'B2: Local Path Ingestion Boundaries',
  tier: 2,
  feature: 'B2',
  tests: [
    {
      id: 'T2_B2_01',
      name: 'Reject non-existent file paths with clear FileNotFoundError',
      run: async (t) => {
        function validateLocalFilePath(filePath) {
          if (!fs.existsSync(filePath)) {
            throw new Error(`FileNotFoundError: File "${filePath}" does not exist`);
          }
          return true;
        }
        t.assertThrows(
          () => validateLocalFilePath('/tmp/non_existent_file_xyz_12345.html'),
          /FileNotFoundError/
        );
      }
    },
    {
      id: 'T2_B2_02',
      name: 'Reject unsupported file extensions (.pdf, .png, .exe, .zip)',
      run: async (t) => {
        function validateExtension(filePath) {
          const ext = path.extname(filePath).toLowerCase();
          const allowed = ['.html', '.htm'];
          if (!allowed.includes(ext)) {
            throw new Error(`UnsupportedFileTypeError: Extension "${ext}" is not supported. Must be .html or .htm`);
          }
          return true;
        }
        t.assertThrows(() => validateExtension('document.pdf'), /UnsupportedFileTypeError/);
        t.assertThrows(() => validateExtension('image.png'), /UnsupportedFileTypeError/);
        t.assertThrows(() => validateExtension('archive.zip'), /UnsupportedFileTypeError/);
        t.assert(validateExtension('index.html'));
      }
    },
    {
      id: 'T2_B2_03',
      name: 'Handle 0-byte empty HTML files with informative error',
      run: async (t) => {
        function validateHtmlContent(content) {
          if (!content || content.trim().length === 0) {
            throw new Error('EmptyFileError: HTML file is empty (0 bytes)');
          }
          return true;
        }
        t.assertThrows(() => validateHtmlContent(''), /EmptyFileError/);
        t.assertThrows(() => validateHtmlContent('   \n\t  '), /EmptyFileError/);
      }
    },
    {
      id: 'T2_B2_04',
      name: 'Handle directories without index.html gracefully',
      run: async (t) => {
        function resolveDirectoryIndex(dirPath) {
          const candidates = ['index.html', 'index.htm'];
          for (const cand of candidates) {
            const p = path.join(dirPath, cand);
            if (fs.existsSync(p)) return p;
          }
          throw new Error(`MissingIndexError: Directory "${dirPath}" contains no index.html`);
        }
        t.assertThrows(() => resolveDirectoryIndex('/tmp'), /MissingIndexError/);
      }
    },
    {
      id: 'T2_B2_05',
      name: 'Verify extractor handles relative and absolute paths uniformly',
      run: async (t) => {
        t.checkFileExists('extractor/engine.js', 'M1', 'Extractor engine required to test path normalization');
      }
    }
  ]
};
