from pathlib import Path

path = Path('scripts/apply_capture_data_quality.py')
text = path.read_text(encoding='utf-8')
old = '''text = replace_once(
    text,
    "    if (Array.isArray(current)) {\\n      for (const child of current.slice(0, 40)) queue.push(child);\\n    }",
    "    if (Array.isArray(current)) {\\n      if (current.length >= 2) {\\n        const first = current[0];\\n        const second = current[1];\\n        const firstText = typeof first === 'string' || typeof first === 'number' ? String(first) : '';\\n        const secondText = typeof second === 'string' || typeof second === 'number' ? String(second) : '';\\n        if (/^\\\\d{15,20}$/.test(firstText) && /^\\\\d{15,20}$/.test(secondText)) {\\n          try {\\n            return `0x${BigInt(firstText).toString(16)}:0x${BigInt(secondText).toString(16)}`;\\n          } catch {}\\n        }\\n      }\\n      for (const child of current.slice(0, 40)) queue.push(child);\\n    }",
    'entitylist decimal feature id',
)'''
new = '''text = regex_once(
    text,
    r"(export function findEntityListPlaceId\\(item\\?: unknown\\): string \\| undefined \\{[\\s\\S]*?)(    if \\(Array\\.isArray\\(current\\)\\) \\{\\n      for \\(const child of current\\.slice\\(0, 40\\)\\) queue\\.push\\(child\\);\\n    \\})",
    lambda_match := r"\\1    if (Array.isArray(current)) {\\n      if (current.length >= 2) {\\n        const first = current[0];\\n        const second = current[1];\\n        const firstText = typeof first === 'string' || typeof first === 'number' ? String(first) : '';\\n        const secondText = typeof second === 'string' || typeof second === 'number' ? String(second) : '';\\n        if (/^\\\\d{15,20}$/.test(firstText) && /^\\\\d{15,20}$/.test(secondText)) {\\n          try {\\n            return `0x${BigInt(firstText).toString(16)}:0x${BigInt(secondText).toString(16)}`;\\n          } catch {}\\n        }\\n      }\\n      for (const child of current.slice(0, 40)) queue.push(child);\\n    }",
    'entitylist decimal feature id',
    flags=re.M,
)'''
# Avoid the helper's replacement-string escape handling entirely: use a function-local split instead.
if old not in text:
    raise SystemExit('expected driver block not found')
new = '''start = text.index("export function findEntityListPlaceId")
end = text.index("export function findEntityListCategory", start)
segment = text[start:end]
old_segment = "    if (Array.isArray(current)) {\\n      for (const child of current.slice(0, 40)) queue.push(child);\\n    }"
new_segment = "    if (Array.isArray(current)) {\\n      if (current.length >= 2) {\\n        const first = current[0];\\n        const second = current[1];\\n        const firstText = typeof first === 'string' || typeof first === 'number' ? String(first) : '';\\n        const secondText = typeof second === 'string' || typeof second === 'number' ? String(second) : '';\\n        if (/^\\\\d{15,20}$/.test(firstText) && /^\\\\d{15,20}$/.test(secondText)) {\\n          try {\\n            return `0x${BigInt(firstText).toString(16)}:0x${BigInt(secondText).toString(16)}`;\\n          } catch {}\\n        }\\n      }\\n      for (const child of current.slice(0, 40)) queue.push(child);\\n    }"
if segment.count(old_segment) != 1:
    raise RuntimeError(f'entitylist decimal feature id: expected one match inside findEntityListPlaceId, got {segment.count(old_segment)}')
segment = segment.replace(old_segment, new_segment, 1)
text = text[:start] + segment + text[end:]'''
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('driver repaired')
