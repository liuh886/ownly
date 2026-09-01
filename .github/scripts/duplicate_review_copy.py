from pathlib import Path

path = Path('src/components/planner/PlannerHome.tsx')
text = path.read_text()
changes = {
    "title={zh ? '查看并合并疑似重复的同类地点' : 'Review and merge suspected duplicate places'}": "title={zh ? '逐组复核疑似重复地点' : 'Review suspected duplicate places pair by pair'}",
    "✨ {zh ? `合并疑似同类 (${visibleSuspectedPairs.length})` : `Suspected Duplicates (${visibleSuspectedPairs.length})`}": "✨ {zh ? `疑似重复复核 (${visibleSuspectedPairs.length})` : `Duplicate Review (${visibleSuspectedPairs.length})`}",
    "title={zh ? '扫描并清理当前行程的重复地点' : 'Scan and merge duplicate places'}": "title={zh ? '仅按 Google Place ID / CID 等强身份自动清理重复地点' : 'Auto-clean only duplicates proven by strong Place ID / CID identity'}",
    "🧹 {zh ? '一键去重' : 'Deduplicate'}": "🧹 {zh ? '强身份去重' : 'Strong-ID Dedup'}",
}
for old, new in changes.items():
    if old not in text:
        raise SystemExit(f'missing copy anchor: {old}')
    text = text.replace(old, new, 1)
path.write_text(text)
