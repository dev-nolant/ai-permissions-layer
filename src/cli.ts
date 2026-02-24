#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { compile } from './compiler.js';
import { createOpenAIAdapter } from './adapters/openai-adapter.js';

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] || 'rules.yaml';
  const outputFile = args[1] || 'rules.compiled.json';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY required');
    process.exit(1);
  }
  const content = readFileSync(inputFile, 'utf-8');
  const rules = content
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*["']?|["']?$/g, '').trim());
  const llm = createOpenAIAdapter(apiKey);
  const { rules: compiled } = await compile(rules, llm);
  writeFileSync(outputFile, JSON.stringify({ rules: compiled }, null, 2));
  console.log(`Compiled ${compiled.length} rules to ${outputFile}`);
}
main().catch(console.error);
