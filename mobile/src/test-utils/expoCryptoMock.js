// Jest only: expo-crypto's native module does not exist in Node, so its
// randomUUID() returns undefined there. Use Node's own secure UUID instead.
const { randomUUID } = require('node:crypto');

module.exports = { randomUUID };
