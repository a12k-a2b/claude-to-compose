/**
 * verification/build_runner.js
 *
 * Programmatic Gradle Build & Unit Test Runner.
 * Executes compileDebugKotlin and testDebugUnitTest against the android/ project.
 * Implements bounded timeouts (60s preview test cap), environment auto-discovery,
 * and structured Kotlin compiler error parsing.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

class SdkNotFoundError extends Error {
  constructor(message = 'Android SDK path could not be resolved from local.properties or ANDROID_HOME') {
    super(`SdkNotFoundError: ${message}`);
    this.name = 'SdkNotFoundError';
  }
}

class GradleWrapperNotFoundError extends Error {
  constructor(message = 'gradlew wrapper not found in android directory') {
    super(`GradleWrapperNotFoundError: ${message}`);
    this.name = 'GradleWrapperNotFoundError';
  }
}

class BuildRunner {
  /**
   * @param {Object} [options]
   * @param {string} [options.projectRoot]
   * @param {string} [options.androidDir]
   * @param {number} [options.defaultTimeoutMs]
   * @param {number} [options.testTimeoutMs]
   */
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || path.resolve(__dirname, '..');
    this.androidDir = options.androidDir || path.join(this.projectRoot, 'android');
    this.gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    this.defaultTimeoutMs = options.defaultTimeoutMs || 180000; // 3 min
    this.testTimeoutMs = options.testTimeoutMs || 60000; // 60s cap (B20)
  }

  /**
   * Discovers Android SDK path per B19 boundary test.
   *
   * @param {string|null} localPropContent
   * @param {string|null} envVar
   * @returns {string|null}
   */
  static resolveAndroidSdk(localPropContent, envVar) {
    if (localPropContent) {
      const match = localPropContent.match(/^\s*sdk\.dir\s*=\s*(.*)$/m);
      if (match && match[1].trim()) return match[1].trim();
    }
    if (envVar && envVar.trim()) return envVar.trim();
    return null;
  }

  /**
   * Pre-flight checks on Gradle wrapper, executable bits, and SDK location.
   *
   * @returns {{gradlewPath: string, sdkPath: string|null}}
   */
  ensureEnvironment() {
    const gradlewFilename = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
    const gradlewPath = path.join(this.androidDir, gradlewFilename);

    if (!fs.existsSync(gradlewPath)) {
      throw new GradleWrapperNotFoundError(`Wrapper not found at ${gradlewPath}`);
    }

    if (process.platform !== 'win32') {
      try {
        const stat = fs.statSync(gradlewPath);
        if ((stat.mode & 0o111) === 0) {
          fs.chmodSync(gradlewPath, 0o755);
        }
      } catch (_) {}
    }

    const localPropPath = path.join(this.androidDir, 'local.properties');
    const localContent = fs.existsSync(localPropPath)
      ? fs.readFileSync(localPropPath, 'utf8')
      : null;

    const envSdk =
      process.env.ANDROID_HOME ||
      process.env.ANDROID_SDK_ROOT;

    const sdkPath = BuildRunner.resolveAndroidSdk(localContent, envSdk);
    return { gradlewPath, sdkPath };
  }

  /**
   * Parses Kotlin compiler error lines into structured objects.
   * Format: e: <file>: (<line>, <column>): <message>
   *
   * @param {string} output
   * @returns {Array<{file: string, line: number, column: number, message: string}>}
   */
  static parseKotlinErrors(output) {
    const errors = [];
    if (!output) return errors;

    const regex = /^e:\s+([^\r\n:]+):\s+\((\d+),\s+(\d+)\):\s+(.+)$/gm;
    let match;
    while ((match = regex.exec(output)) !== null) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[4].trim()
      });
    }
    return errors;
  }

  /**
   * Executes arbitrary Gradle tasks with bounded timeout and stream parsing.
   *
   * @param {Array<string>} tasks
   * @param {Object} [options]
   * @returns {Promise<{
   *   success: boolean,
   *   exitCode: number,
   *   signal: string|null,
   *   durationMs: number,
   *   timedOut: boolean,
   *   errors: Array<Object>,
   *   failureReason: string|null,
   *   stdout: string,
   *   stderr: string
   * }>}
   */
  async runGradle(tasks, options = {}) {
    this.ensureEnvironment();
    const timeoutMs = options.timeout || this.defaultTimeoutMs;
    const args = [...tasks, '--no-daemon', ...(options.extraArgs || [])];

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    return new Promise((resolve) => {
      const child = spawn(this.gradlew, args, {
        cwd: this.androidDir,
        env: { ...process.env, ...(options.env || {}) },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 2000);
        }, timeoutMs);
      }

      child.stdout.on('data', (d) => {
        stdout += d.toString('utf8');
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString('utf8');
      });

      child.on('close', (code, signal) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const combined = stdout + '\n' + stderr;
        const kotlinErrors = BuildRunner.parseKotlinErrors(combined);

        let failureReason = null;
        if (timedOut) {
          failureReason = `Execution timed out after ${timeoutMs}ms`;
        } else if (code !== 0) {
          const failMatch = combined.match(
            /\* What went wrong:\s*([\s\S]+?)(?=\* Try:|\* Exception is:|$)/
          );
          failureReason = failMatch
            ? failMatch[1].trim()
            : `Process exited with code ${code}`;
        }

        resolve({
          success: code === 0 && kotlinErrors.length === 0 && !timedOut,
          exitCode: code !== null ? code : -1,
          signal,
          durationMs,
          timedOut,
          errors: kotlinErrors,
          failureReason,
          stdout,
          stderr
        });
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        resolve({
          success: false,
          exitCode: -1,
          signal: null,
          durationMs: Date.now() - startTime,
          timedOut: false,
          errors: [],
          failureReason: err.message,
          stdout,
          stderr
        });
      });
    });
  }

  /**
   * Compiles Kotlin debug codebase (F19).
   *
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async compile(options = {}) {
    return this.runGradle(['compileDebugKotlin'], options);
  }

  /**
   * Executes Robolectric PreviewScreenshotTest to capture rendered_preview.png (F20).
   *
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async runPreviewTest(options = {}) {
    const res = await this.runGradle(
      ['testDebugUnitTest'],
      {
        extraArgs: ['--tests', 'com.claude.compose.PreviewScreenshotTest'],
        timeout: options.timeout || this.testTimeoutMs,
        ...options
      }
    );

    const candidatePaths = [
      path.join(this.androidDir, 'app/build/outputs/preview/rendered_preview.png'),
      path.join(this.androidDir, 'build/outputs/preview/rendered_preview.png')
    ];

    let renderedPreviewPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        renderedPreviewPath = p;
        break;
      }
    }

    return {
      ...res,
      renderedPreviewPath,
      previewGenerated: Boolean(renderedPreviewPath)
    };
  }

  /**
   * Executes full build and preview test pipeline sequentially.
   *
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async buildAndTest(options = {}) {
    const compileRes = await this.compile(options);
    if (!compileRes.success) {
      return {
        stage: 'compile',
        compile: compileRes,
        test: null,
        success: false
      };
    }

    const testRes = await this.runPreviewTest(options);
    return {
      stage: 'complete',
      compile: compileRes,
      test: testRes,
      success: compileRes.success && testRes.success && testRes.previewGenerated
    };
  }
}

module.exports = {
  BuildRunner,
  SdkNotFoundError,
  GradleWrapperNotFoundError
};
