#!/usr/bin/env node

/**
 * hello.js — Test script for Agent OnBoard work server
 * Outputs a simple JSON status message to verify execution works.
 */

const result = {
  status: 'ok',
  message: 'Hello from Agent OnBoard work server!',
  timestamp: new Date().toISOString(),
  node_version: process.version,
  platform: process.platform,
  pid: process.pid
};

console.log(JSON.stringify(result, null, 2));
