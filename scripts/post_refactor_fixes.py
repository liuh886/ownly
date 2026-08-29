from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'{path}: missing cleanup snippet: {old[:120]}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# The original FX block wrapped local-storage listeners and the background query
# in one try/catch. The hard cut removes the storage listeners; keep the query
# itself inside a fresh try/catch.
replace_once(
    'src/extension/content.ts',
    "  function applyOverride(override?: string) {\n    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;\n  }\n\n    // 3. Query background for FX rates & target currency",
    "  function applyOverride(override?: string) {\n    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;\n  }\n\n  try {\n    // Query background for FX rates & target currency",
)

print('post-refactor cleanup applied')
