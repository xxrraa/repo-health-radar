export function renderMarkdown(result) {
  const lines = [];
  lines.push("# Repo Health Radar Report");
  lines.push("");
  lines.push(`Score: **${result.score}/100** (${result.grade})`);
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push("");
  lines.push("## Category Summary");
  lines.push("");
  lines.push("| Category | Score |");
  lines.push("| --- | ---: |");
  for (const category of result.categories) {
    lines.push(`| ${escapePipe(category.title)} | ${category.score}/${category.possible} |`);
  }
  lines.push("");

  if (result.recommendations.length > 0) {
    lines.push("## High Impact Fixes");
    lines.push("");
    for (const item of result.recommendations) {
      lines.push(`- **${item.category}: ${item.check}** - ${item.recommendation}`);
    }
    lines.push("");
  }

  lines.push("## Checks");
  lines.push("");
  for (const category of result.categories) {
    lines.push(`### ${category.title}`);
    lines.push("");
    lines.push("| Status | Check | Points | Evidence |");
    lines.push("| --- | --- | ---: | --- |");
    for (const check of category.checks) {
      lines.push(
        `| ${check.status.toUpperCase()} | ${escapePipe(check.title)} | ${check.points}/${check.maxPoints} | ${escapePipe(check.evidence)} |`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
