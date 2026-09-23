'use strict';

/**
 * src/contract/schemas/index.js
 *
 * Centralized Schema Registry & Validator Engine for Design Contracts & Approvals.
 * Compiles JSON Schema Draft 2020-12 schemas using Ajv 2020 + ajv-formats.
 */

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Canonical schema file mapping
const SCHEMA_FILE_MAP = {
  ownerApproval: 'owner_approval.schema.json',
  measuredScene: 'measured_scene.json',
  layoutIntent: 'layout_intent.json',
  behaviorContract: 'behavior_contract.json',
  designSystem: 'design_system.json',
  contractReceipt: 'contract_receipt.json'
};

// Recognized aliases for lookups
const SCHEMA_ALIASES = {
  'owner-approval.schema.json': 'owner_approval.schema.json',
  'owner_approval.schema.json': 'owner_approval.schema.json',
  'owner_approval': 'owner_approval.schema.json',
  'owner-approval': 'owner_approval.schema.json',
  'measured_scene.json': 'measured_scene.json',
  'measured-scene.schema.json': 'measured_scene.json',
  'measured_scene': 'measured_scene.json',
  'measured-scene': 'measured_scene.json',
  'layout_intent.json': 'layout_intent.json',
  'layout-intent.schema.json': 'layout_intent.json',
  'layout_intent': 'layout_intent.json',
  'layout-intent': 'layout_intent.json',
  'behavior_contract.json': 'behavior_contract.json',
  'behavior-contract.schema.json': 'behavior_contract.json',
  'behavior_contract': 'behavior_contract.json',
  'behavior-contract': 'behavior_contract.json',
  'design_system.json': 'design_system.json',
  'design-system.schema.json': 'design_system.json',
  'design_system': 'design_system.json',
  'design-system': 'design_system.json',
  'contract_receipt.json': 'contract_receipt.json',
  'contract-receipt.schema.json': 'contract_receipt.json',
  'contract_receipt': 'contract_receipt.json',
  'contract-receipt': 'contract_receipt.json'
};

// Load raw schemas from disk
const rawSchemas = {};
for (const [key, filename] of Object.entries(SCHEMA_FILE_MAP)) {
  const filePath = path.join(__dirname, filename);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    rawSchemas[key] = parsed;
    rawSchemas[filename] = parsed;
  }
}

// Ensure alias references in rawSchemas dictionary
for (const [alias, target] of Object.entries(SCHEMA_ALIASES)) {
  if (rawSchemas[target] && !rawSchemas[alias]) {
    rawSchemas[alias] = rawSchemas[target];
  }
}

/**
 * Creates and configures a new Ajv 2020 instance.
 * @param {object} options
 * @returns {Ajv2020}
 */
function createContractAjv(options = {}) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    strictNumbers: true,
    ...options
  });
  addFormats(ajv);
  return ajv;
}

// Global cached Ajv instance
const contractAjv = createContractAjv();

// Register all schemas in Ajv
for (const [key, schema] of Object.entries(rawSchemas)) {
  if (schema && typeof schema === 'object') {
    if (schema.$id && !contractAjv.getSchema(schema.$id)) {
      try {
        contractAjv.addSchema(schema, schema.$id);
      } catch (_) {
        // May already be added
      }
    }
    if (!contractAjv.getSchema(key)) {
      try {
        contractAjv.addSchema(schema, key);
      } catch (_) {
        // Schema may already be registered under its $id
      }
    }
  }
}

// Additional known alias IDs
if (rawSchemas.ownerApproval) {
  const ownerSchema = rawSchemas.ownerApproval;
  const legacyId = 'https://claude-to-compose.local/schemas/v1/owner-approval.schema.json';
  const v2Id = 'https://daylight.dev/schemas/ctc/v2/owner-approval.schema.json';
  if (!contractAjv.getSchema(legacyId)) {
    try { contractAjv.addSchema(ownerSchema, legacyId); } catch (_) {}
  }
  if (!contractAjv.getSchema(v2Id)) {
    try { contractAjv.addSchema(ownerSchema, v2Id); } catch (_) {}
  }
}

/**
 * Translates raw Ajv errors into structured, user-facing issue diagnostics.
 * @param {Array<object>} ajvErrors
 * @param {string} [label='data']
 * @returns {Array<object>}
 */
function formatSchemaIssues(ajvErrors, label = 'data') {
  if (!Array.isArray(ajvErrors) || ajvErrors.length === 0) return [];

  return ajvErrors.map((err) => {
    const instancePath = err.instancePath || '';
    const pathDisplay = instancePath.length > 0 ? instancePath : '/';
    let detail = '';

    switch (err.keyword) {
      case 'required':
        detail = `missing required property '${err.params?.missingProperty}'`;
        break;
      case 'additionalProperties':
        detail = `unexpected property '${err.params?.additionalProperty}' not allowed`;
        break;
      case 'pattern':
        detail = `value "${err.data !== undefined ? err.data : ''}" does not match pattern ${err.params?.pattern}`;
        break;
      case 'const':
        detail = `must be constant value '${err.params?.allowedValue}'`;
        break;
      case 'minItems':
        detail = `array must have at least ${err.params?.limit} items`;
        break;
      case 'maxItems':
        detail = `array must have at most ${err.params?.limit} items`;
        break;
      case 'minLength':
        detail = `string must have at least ${err.params?.limit} characters`;
        break;
      case 'maxLength':
        detail = `string must have at most ${err.params?.limit} characters`;
        break;
      case 'type':
        detail = `must be of type ${err.params?.type}`;
        break;
      case 'enum':
        detail = `must be one of allowed values [${(err.params?.allowedValues || []).join(', ')}]`;
        break;
      default:
        detail = err.message || 'schema validation failed';
    }

    return {
      path: pathDisplay,
      keyword: err.keyword,
      message: err.message,
      params: err.params,
      detail: `${pathDisplay}: ${detail}`,
      schemaPath: err.schemaPath
    };
  });
}

/**
 * Formats structured errors into a concise human-readable string summary.
 * @param {Array<object>} ajvErrors
 * @param {string} [label='data']
 * @returns {string}
 */
function formatSchemaErrorsText(ajvErrors, label = 'data') {
  const issues = formatSchemaIssues(ajvErrors, label);
  if (issues.length === 0) return '';
  return issues.map((i) => `${label}${i.path === '/' ? '' : i.path} ${i.message} (${i.keyword})`).join('; ');
}

// Precompiled raw validators
const compiledValidators = {};

function getOrCompileValidator(schemaKey) {
  const normalizedKey = SCHEMA_ALIASES[schemaKey] || schemaKey;
  if (compiledValidators[normalizedKey]) {
    return compiledValidators[normalizedKey];
  }
  const schemaObj = rawSchemas[normalizedKey] || rawSchemas[schemaKey];
  if (!schemaObj) {
    throw new Error(`Schema not found for key: "${schemaKey}"`);
  }
  const validator = contractAjv.compile(schemaObj);
  compiledValidators[normalizedKey] = validator;
  return validator;
}

// Pre-warm primary validators
for (const key of Object.keys(SCHEMA_FILE_MAP)) {
  if (rawSchemas[key]) {
    getOrCompileValidator(key);
  }
}

/**
 * Validates an OwnerApproval document against Draft 2020-12 schema.
 * Operates as a dual-mode validator:
 * - When called as `validateOwnerApproval(data)`: returns boolean; attaches `.errors` and `.issues`.
 * - When called with `options.detailed = true`: returns `{ valid, issues, errors, errorText }`.
 * - When called with `options.throwOnError = true`: throws `SCHEMA_VALIDATION_ERROR` on failure.
 *
 * @param {object} data
 * @param {object} [options={}]
 * @param {string} [options.label='owner approval']
 * @param {boolean} [options.detailed=false]
 * @param {boolean} [options.throwOnError=false]
 * @returns {boolean|{valid: boolean, issues: Array, errors: Array, errorText: string}}
 */
function validateOwnerApproval(data, options = {}) {
  const label = options.label || 'owner approval';
  const rawValidator = getOrCompileValidator('ownerApproval');
  const valid = Boolean(rawValidator(data));
  const rawErrors = rawValidator.errors ? [...rawValidator.errors] : [];
  const issues = formatSchemaIssues(rawErrors, label);
  const errorText = formatSchemaErrorsText(rawErrors, label);

  validateOwnerApproval.errors = rawErrors.length > 0 ? rawErrors : null;
  validateOwnerApproval.issues = issues;
  validateOwnerApproval.errorText = errorText;

  if (options.throwOnError && !valid) {
    const error = new Error(`${label} failed schema validation:\n${issues.map((i) => `  - ${i.detail}`).join('\n')}`);
    error.code = 'SCHEMA_VALIDATION_ERROR';
    error.validationErrors = issues;
    error.rawErrors = rawErrors;
    throw error;
  }

  if (options.detailed) {
    return {
      valid,
      issues,
      errors: rawErrors,
      errorText
    };
  }

  return valid;
}

/**
 * Validates an OwnerApproval document and throws if invalid.
 * @param {object} data
 * @param {string} [label='owner approval']
 * @returns {boolean}
 */
function validateOwnerApprovalOrThrow(data, label = 'owner approval') {
  return validateOwnerApproval(data, { label, throwOnError: true });
}

// Wrapper generators for layer validators
function makeLayerValidator(key, defaultLabel) {
  const fn = function (data, options = {}) {
    const label = options.label || defaultLabel;
    const rawValidator = getOrCompileValidator(key);
    const valid = Boolean(rawValidator(data));
    const rawErrors = rawValidator.errors ? [...rawValidator.errors] : [];
    const issues = formatSchemaIssues(rawErrors, label);
    const errorText = formatSchemaErrorsText(rawErrors, label);

    fn.errors = rawErrors.length > 0 ? rawErrors : null;
    fn.issues = issues;
    fn.errorText = errorText;

    if (options.throwOnError && !valid) {
      const error = new Error(`${label} failed schema validation: ${errorText}`);
      error.code = 'SCHEMA_VALIDATION_ERROR';
      error.validationErrors = issues;
      error.rawErrors = rawErrors;
      throw error;
    }

    if (options.detailed) {
      return { valid, issues, errors: rawErrors, errorText };
    }

    return valid;
  };
  return fn;
}

const validateMeasuredScene = makeLayerValidator('measuredScene', 'measured scene');
const validateLayoutIntent = makeLayerValidator('layoutIntent', 'layout intent');
const validateBehaviorContract = makeLayerValidator('behaviorContract', 'behavior contract');
const validateDesignSystem = makeLayerValidator('designSystem', 'design system');
const validateContractReceipt = makeLayerValidator('contractReceipt', 'contract receipt');

/**
 * Generic schema validator lookup.
 * @param {string} schemaName
 * @param {object} data
 * @param {object} [options={}]
 * @returns {boolean|object}
 */
function validateSchema(schemaName, data, options = {}) {
  const normalizedKey = SCHEMA_ALIASES[schemaName] || schemaName;
  const rawValidator = getOrCompileValidator(normalizedKey);
  const label = options.label || schemaName;
  const valid = Boolean(rawValidator(data));
  const rawErrors = rawValidator.errors ? [...rawValidator.errors] : [];
  const issues = formatSchemaIssues(rawErrors, label);
  const errorText = formatSchemaErrorsText(rawErrors, label);

  if (options.throwOnError && !valid) {
    const error = new Error(`${label} failed schema validation: ${errorText}`);
    error.code = 'SCHEMA_VALIDATION_ERROR';
    error.validationErrors = issues;
    error.rawErrors = rawErrors;
    throw error;
  }

  if (options.detailed) {
    return { valid, issues, errors: rawErrors, errorText };
  }

  return valid;
}

module.exports = {
  // Primary Validators
  validateOwnerApproval,
  validateOwnerApprovalOrThrow,
  validateMeasuredScene,
  validateLayoutIntent,
  validateBehaviorContract,
  validateDesignSystem,
  validateContractReceipt,
  validateSchema,

  // Diagnostics & Formatting
  formatSchemaIssues,
  formatSchemaErrorsText,

  // Engine & Schemas
  createContractAjv,
  getOrCompileValidator,
  schemas: rawSchemas
};
