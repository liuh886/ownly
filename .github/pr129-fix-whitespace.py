from pathlib import Path

path = Path('docs/AI_PLANNER_MCP.md')
text = path.read_text(encoding='utf-8')
old = '将观景台、日落机位、海滩/地标安排在日落前约 1 小时至蓝调时刻；如果无法确认日落时间，不要猜固定时刻；  \n'
new = '将观景台、日落机位、海滩/地标安排在日落前约 1 小时至蓝调时刻；如果无法确认日落时间，不要猜固定时刻；\n'
if old not in text:
    raise RuntimeError('target prompt line not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
