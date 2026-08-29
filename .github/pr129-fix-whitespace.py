from pathlib import Path

path = Path('docs/AI_PLANNER_MCP.md')
lines = path.read_text(encoding='utf-8').splitlines()
needle = '如果无法确认日落时间，不要猜固定时刻；'
matched = False
for index, line in enumerate(lines):
    if needle in line:
        lines[index] = line.rstrip()
        matched = True
        break
if not matched:
    raise RuntimeError('target prompt line not found')
path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
