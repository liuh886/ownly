from pathlib import Path

path = Path('scripts/refactor_capture_boundary.py')
text = path.read_text(encoding='utf-8')

replacements = {
    "state_block.subn(state_replacement, domain, count=1)": "state_block.subn(lambda _match: state_replacement, domain, count=1)",
    "merge_block.subn(merge_replacement, domain, count=1)": "merge_block.subn(lambda _match: merge_replacement, domain, count=1)",
    "identity_block.subn(identity_replacement, domain, count=1)": "identity_block.subn(lambda _match: identity_replacement, domain, count=1)",
    "old_upsert.subn(new_upsert, repo, count=1)": "old_upsert.subn(lambda _match: new_upsert, repo, count=1)",
    "first_panel.subn(first_panel_replacement, html, count=1)": "first_panel.subn(lambda _match: first_panel_replacement, html, count=1)",
    "render_state_pattern.subn(render_state_repl, ui, count=1)": "render_state_pattern.subn(lambda _match: render_state_repl, ui, count=1)",
    "save_pattern.subn(save_repl, handlers, count=1)": "save_pattern.subn(lambda _match: save_repl, handlers, count=1)",
    "currency_pattern.subn(currency_repl, handlers, count=1)": "currency_pattern.subn(lambda _match: currency_repl, handlers, count=1)",
    "smart_pattern.subn(smart_repl, handlers, count=1)": "smart_pattern.subn(lambda _match: smart_repl, handlers, count=1)",
    "bulk_pattern.subn(bulk_repl, handlers, count=1)": "bulk_pattern.subn(lambda _match: bulk_repl, handlers, count=1)",
    "batch_pattern.subn(batch_repl, handlers, count=1)": "batch_pattern.subn(lambda _match: batch_repl, handlers, count=1)",
    "capture_pattern.subn(capture_repl, handlers, count=1)": "capture_pattern.subn(lambda _match: capture_repl, handlers, count=1)",
    "add_expense_pattern.subn(add_expense_repl, planner, count=1)": "add_expense_pattern.subn(lambda _match: add_expense_repl, planner, count=1)",
    "members_pattern.subn(members_repl, planner, count=1)": "members_pattern.subn(lambda _match: members_repl, planner, count=1)",
    "hydrate_pattern.subn(hydrate_repl, planner, count=1)": "hydrate_pattern.subn(lambda _match: hydrate_repl, planner, count=1)",
    "area: existing?.area ?? place.address?.split(/[,，·]/)[0]?.trim() || undefined,": "area: (existing?.area ?? place.address?.split(/[,，·]/)[0]?.trim()) || undefined,",
}

for old, new in replacements.items():
    if old not in text:
        raise RuntimeError(f'missing driver snippet: {old}')
    text = text.replace(old, new)

path.write_text(text, encoding='utf-8')
print('refactor driver patched')
