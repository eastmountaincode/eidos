// Run against a signed-in agent-browser session; changes only temporary DOM fixtures.
// Usage: node scripts/check-chat-scroll.mjs SESSION
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const session = process.argv[2];
if (!session) throw new Error('Pass the signed-in browser session name.');
const script = `(async () => {
  const scroller = document.querySelector('[role="log"][aria-label="Conversation"]');
  if (!scroller) throw new Error('Open the chat first.');
  const content = scroller.firstElementChild;
  const composer = document.querySelector('.eidos-v2-composer');
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame); };
  const gap = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  const expectBottom = (label) => { if (Math.abs(gap()) > 2) throw new Error(label + ': ' + gap() + 'px from bottom'); };
  const probe = document.createElement('div');
  probe.style.cssText = 'height:640px;flex-shrink:0';
  probe.textContent = 'Temporary scroll verification fixture';
  const padding = composer.style.paddingTop;
  try {
    await settle();
    expectBottom('Initial history');
    content.append(probe);
    await settle(); expectBottom('New reply');
    probe.style.height = '1024px';
    await settle(); expectBottom('Delayed content growth');
    scroller.scrollTop -= 320;
    await settle();
    const readingPosition = scroller.scrollTop;
    probe.style.height = '1400px';
    await settle();
    if (Math.abs(scroller.scrollTop - readingPosition) > 2) throw new Error('Moved while reading older messages');
    scroller.scrollTop = scroller.scrollHeight;
    await settle();
    probe.style.height = '1600px';
    await settle(); expectBottom('Resume following');
    composer.style.paddingTop = '80px';
    await settle(); expectBottom('Composer/viewport resize');
    return { passed: ['initial history', 'new reply', 'delayed growth', 'reading position preserved', 'resume following', 'composer resize'], bottomGap: gap(), width: innerWidth };
  } finally {
    composer.style.paddingTop = padding;
    probe.remove();
    await settle();
  }
})()`;
const result = JSON.parse(execFileSync('npx', ['agent-browser@0.38.1', '--session', session, 'eval', script, '--json'], { encoding: 'utf8' }));
assert.equal(result.success, true, JSON.stringify(result.error));
console.log(JSON.stringify(result.data, null, 2));
