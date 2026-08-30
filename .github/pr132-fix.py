from pathlib import Path

path = Path('docs/PLANNER.md')
path.write_text(path.read_text(encoding='utf-8').rstrip() + '\n', encoding='utf-8')
print('PR132 generated docs EOF normalized')
