#!/usr/bin/env node
// Refreshes the Featured Projects blurbs in README.md between the marker
// comments using the Anthropic API (claude-haiku-4-5). Repo metadata is
// pulled with `gh api`. If anything fails, the README is left untouched so
// the committed static fallback remains correct.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const README = "README.md";
const START = "<!-- FEATURED-PROJECTS:START -->";
const END = "<!-- FEATURED-PROJECTS:END -->";
const MODEL = "claude-haiku-4-5";

// Curated set — the repos being actively upgraded. Order is the display order.
const REPOS = [
  "awesome-ai-tools",
  "JobPrep",
  "games",
  "github-traffic-analytics",
  "pulmocare",
  "rakcha",
];

const owner = process.env.OWNER || "aliammari1";
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.log("ANTHROPIC_API_KEY not set — leaving README untouched.");
  process.exit(0);
}

function gh(path) {
  const out = execFileSync("gh", ["api", path], { encoding: "utf8" });
  return JSON.parse(out);
}

// Gather metadata. A single repo failing (renamed/private) is non-fatal.
const repoData = [];
for (const name of REPOS) {
  try {
    const r = gh(`repos/${owner}/${name}`);
    repoData.push({
      name: r.name,
      url: r.html_url,
      description: r.description || "",
      language: r.language || "",
      stars: r.stargazers_count ?? 0,
      topics: (r.topics || []).slice(0, 6),
    });
  } catch (e) {
    console.warn(`Skipping ${name}: ${e.message}`);
  }
}

if (repoData.length === 0) {
  console.log("No repo metadata fetched — leaving README untouched.");
  process.exit(0);
}

const prompt = `You write the "Featured Projects" section of a developer's GitHub profile README.
For each repository below, write ONE concise, recruiter-facing line (max ~16 words) describing what it is and why it's notable. No marketing fluff, no emoji, present tense.

Return ONLY a Markdown bullet list, one bullet per repo, in this exact format:
- **[<name>](<url>)** — <one-line description>

Repositories (JSON):
${JSON.stringify(repoData, null, 2)}`;

async function callAnthropic() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Empty response from Anthropic API");
  return text;
}

let blurbs;
try {
  blurbs = await callAnthropic();
} catch (e) {
  console.error(`API call failed — leaving README untouched: ${e.message}`);
  process.exit(0);
}

// Basic sanity check: must look like a bullet list of our repos.
const looksValid =
  blurbs.split("\n").filter((l) => l.trim().startsWith("- ")).length >=
  Math.min(3, repoData.length);
if (!looksValid) {
  console.error("Model output didn't look like a bullet list — keeping fallback.");
  process.exit(0);
}

const md = readFileSync(README, "utf8");
const startIdx = md.indexOf(START);
const endIdx = md.indexOf(END);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  console.error("Featured Projects markers not found in README — aborting.");
  process.exit(1);
}

const before = md.slice(0, startIdx + START.length);
const after = md.slice(endIdx);
const updated = `${before}\n\n${blurbs}\n\n${after}`;

if (updated === md) {
  console.log("No change to README.");
} else {
  writeFileSync(README, updated);
  console.log("README Featured Projects section updated.");
}
