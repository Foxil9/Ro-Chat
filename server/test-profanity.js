// Test script for profanity detection
// Run: node server/test-profanity.js

const { validateMessage } = require('./utils/messageValidator');

console.log('🧪 Testing Advanced Profanity Detection\n');
console.log('=' .repeat(60));

const testMessages = [
  // Normal profanity
  { msg: 'fuck', shouldBlock: true, desc: 'Normal profanity' },
  { msg: 'shit', shouldBlock: true, desc: 'Normal profanity' },
  { msg: 'What the fuck', shouldBlock: true, desc: 'Profanity in sentence' },

  // Asterisk censoring
  { msg: 'f*ck', shouldBlock: true, desc: 'Single asterisk' },
  { msg: 'f**k', shouldBlock: true, desc: 'Double asterisk' },
  { msg: 'sh*t', shouldBlock: true, desc: 'Censored with *' },

  // Letter substitution
  { msg: 'fvck', shouldBlock: true, desc: 'V for U substitution' },
  { msg: 'phuck', shouldBlock: true, desc: 'Ph substitution' },
  { msg: 'fuсk', shouldBlock: true, desc: 'Cyrillic с substitution' },

  // Spacing
  { msg: 'f u c k', shouldBlock: true, desc: 'Spaced letters' },
  { msg: 'f  u  c  k', shouldBlock: true, desc: 'Double spaced' },
  { msg: 's h i t', shouldBlock: true, desc: 'Spaced profanity' },

  // Dots/special chars
  { msg: 'f.u.c.k', shouldBlock: true, desc: 'Dots between letters' },
  { msg: 'f-u-c-k', shouldBlock: true, desc: 'Dashes between letters' },
  { msg: 'f_u_c_k', shouldBlock: true, desc: 'Underscores between' },

  // Leet speak
  { msg: 'fuc|<', shouldBlock: true, desc: 'Leet speak symbols' },
  { msg: '5h1t', shouldBlock: true, desc: 'Numbers substitution' },
  { msg: 'a55', shouldBlock: true, desc: 'Leet speak ass' },

  // Symbol substitution
  { msg: 'f@ck', shouldBlock: true, desc: '@ for a' },
  { msg: 'fu©k', shouldBlock: true, desc: 'Copyright symbol' },
  { msg: '$hit', shouldBlock: true, desc: '$ for s' },

  // Clean messages - should NOT block
  { msg: 'Hello everyone!', shouldBlock: false, desc: 'Normal greeting' },
  { msg: 'Nice game', shouldBlock: false, desc: 'Normal message' },
  { msg: 'GG WP', shouldBlock: false, desc: 'Gaming slang' },
  { msg: 'Check out this cool build', shouldBlock: false, desc: 'Normal sentence' }
];

let passed = 0;
let failed = 0;

testMessages.forEach((test, index) => {
  const result = validateMessage(test.msg);
  const blocked = !result.valid;
  const success = blocked === test.shouldBlock;

  const icon = success ? '✅' : '❌';
  const status = success ? 'PASS' : 'FAIL';

  console.log(`\n${icon} Test ${index + 1}: ${test.desc}`);
  console.log(`   Message: "${test.msg}"`);
  console.log(`   Expected: ${test.shouldBlock ? 'BLOCK' : 'ALLOW'}`);
  console.log(`   Got: ${blocked ? 'BLOCKED' : 'ALLOWED'} - ${status}`);

  if (!result.valid) {
    console.log(`   Error: ${result.error}`);
  }

  if (success) {
    passed++;
  } else {
    failed++;
  }
});

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Results: ${passed}/${testMessages.length} tests passed`);

if (failed > 0) {
  console.log(`⚠️  ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
