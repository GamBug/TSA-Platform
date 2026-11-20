import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatGptFixMessage, extractJson } from '../../scripts/questions-inbox.mjs';

const SET = { format: 'tsa-question-set/1', batch_id: 'B-1', passages: [], questions: [{ text: 'Giá trị $\\frac{1}{2}$' }] };

test('a pasted answer yields its JSON whether fenced, bare or wrapped in chat text', () => {
  const json = JSON.stringify(SET, null, 2);
  assert.deepEqual(extractJson(json).document, SET);
  assert.deepEqual(extractJson(`﻿${json}`).document, SET);
  assert.deepEqual(extractJson(`Here you go:\n\`\`\`json\n${json}\n\`\`\`\nGood luck!`).document, SET);
  assert.deepEqual(extractJson(`\`\`\`\r\n${json}\r\n\`\`\``).document, SET);
  assert.deepEqual(extractJson(`Sure! ${json} Hope it helps.`).document, SET);
  // A short code block in the prose does not win over the document itself.
  assert.deepEqual(extractJson(`Use \`\`\`text\n{}\n\`\`\` then:\n\`\`\`json\n${json}\n\`\`\``).document, SET);
});

test('text without a parsable object is reported, not guessed', () => {
  assert.match(extractJson('no json here').error, /No JSON object/);
  assert.match(extractJson('```json\n{"a": 1,}\n```').error, /does not parse/);
});

test('the fix message lists every problem for the ChatGPT conversation', () => {
  const message = chatGptFixMessage([
    { questionId: 'MATH-G1-000002', code: 'ANSWER_NOT_AN_OPTION', message: 'questions[1].answer.option_id: Answer E is not one of the option ids' },
    { questionId: null, code: 'NOT_JSON', message: 'No JSON object was found in the file.' }]);
  assert.match(message, /^The platform rejected your JSON/);
  assert.match(message, /- MATH-G1-000002: \[ANSWER_NOT_AN_OPTION\] questions\[1\]/);
  assert.match(message, /- \[NOT_JSON\] No JSON object/);
});
