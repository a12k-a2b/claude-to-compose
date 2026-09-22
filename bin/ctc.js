#!/usr/bin/env node
'use strict';

const { run } = require('../retrofit/cli');

process.exitCode = run();
