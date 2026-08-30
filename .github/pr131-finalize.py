from pathlib import Path

path = Path('scripts/shared/ownly-write-service.ts')
text = path.read_text(encoding='utf-8')
old = "        writeEntry(dirname(target.entry.filePath), target.entry.fileName, target.next, target.entry.body);"
new = "        writeFileSync(target.entry.filePath, serializeMarkdownEntity(target.next, target.entry.body), 'utf8');"
if text.count(old) != 1:
    raise SystemExit(f'expected one Planner writeEntry call, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
