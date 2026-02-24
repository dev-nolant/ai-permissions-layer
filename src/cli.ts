#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { compile } from './compiler.js';
import { createOpenAIAdapter } from './adapters/openai-adapter.js';
import { createOpenClawAdapter } from './adapters/openclaw-adapter.js';

async function main() {
  const args = process.argv.slice(2);
  const useOpenClaw = args.includes('--openclaw');
  const filtered = args.filter((a) => a !== '--openclaw');
  const inputFile = filtered[0] || 'rules.yaml';
  const outputFile = filtered[1] || 'rules.compiled.json';

  let llm;
  if (useOpenClaw) {
    const openClaw = createOpenClawAdapter(process.env.OPENAI_API_KEY);
    if (openClaw) {
      llm = openClaw;
      console.error('Using OpenClaw primary model');
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error('OpenClaw config not found or model unresolved. Set OPENAI_API_KEY or run openclaw onboard first.');
        process.exit(1);
      }
      llm = createOpenAIAdapter(apiKey);
      console.error('OpenClaw config not found, falling back to OpenAI');
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY required');
      process.exit(1);
    }
    llm = createOpenAIAdapter(apiKey);
  }

  if (!existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    console.error('Usage: npx ai-permissions-compile [--openclaw] <input.yaml> [output.json]');
    console.error('Example: npx ai-permissions-compile --openclaw examples/rules.yaml ~/.openclaw/ai-permissions-rules.json');
    process.exit(1);
  }
  const content = readFileSync(inputFile, 'utf-8');
  const rules = content
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*["']?|["']?$/g, '').trim());
  const { rules: compiled } = await compile(rules, llm);
  writeFileSync(outputFile, JSON.stringify({ rules: compiled }, null, 2));
  console.log(`Compiled ${compiled.length} rules to ${outputFile}`);
}
main().catch(console.error);
