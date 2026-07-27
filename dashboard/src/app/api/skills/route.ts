import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SKILLS_DIR = join(process.cwd(), '..', '.agents', 'skills');

interface Skill {
  name: string;
  description: string;
  compatibility: string;
  version: string;
  author: string;
  domain: string;
  content: string;
}

function parseSkillFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = match[2];

  const fields: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      fields[key.trim()] = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
    }
  }

  return {
    name: fields.name || '',
    description: fields.description || '',
    compatibility: fields.compatibility || '',
    version: fields.version || '',
    author: fields.author || 'cockroachdb',
    content: body.trim(),
  };
}

function getSkills(): Skill[] {
  try {
    const entries = readdirSync(SKILLS_DIR);
    const skills: Skill[] = [];

    for (const entry of entries) {
      const entryPath = join(SKILLS_DIR, entry);
      if (!statSync(entryPath).isDirectory()) continue;

      // Check if this dir itself contains SKILL.md (flat structure)
      const directSkillPath = join(entryPath, 'SKILL.md');
      try {
        if (statSync(directSkillPath).isFile()) {
          const content = readFileSync(directSkillPath, 'utf-8');
          const parsed = parseSkillFrontmatter(content);
          if (parsed) {
            skills.push({ ...parsed, domain: "cockroachdb" });
          }
          continue;
        }
      } catch {}

      // Otherwise, treat entry as a domain and look for subdirs with SKILL.md
      const skillDirs = readdirSync(entryPath);
      for (const skillDir of skillDirs) {
        const skillPath = join(entryPath, skillDir, 'SKILL.md');
        try {
          if (statSync(skillPath).isFile()) {
            const content = readFileSync(skillPath, 'utf-8');
            const parsed = parseSkillFrontmatter(content);
            if (parsed) {
              skills.push({ ...parsed, domain: entry });
            }
          }
        } catch {}
      }
    }

    return skills;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  const skills = getSkills();

  if (name) {
    const skill = skills.find((s) => s.name === name);
    if (!skill) {
      return NextResponse.json({ error: `Skill '${name}' not found` }, { status: 404 });
    }
    return NextResponse.json({ skill });
  }

  // Return summary list
  const summary = skills.map(({ content, ...rest }) => rest);
  return NextResponse.json({
    total: summary.length,
    domains: [...new Set(skills.map((s) => s.domain))],
    skills: summary,
  });
}
