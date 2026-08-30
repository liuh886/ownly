from pathlib import Path
import subprocess

path = Path('src/components/planner/PlannerHome.tsx')
text = subprocess.check_output(
    ['git', 'show', 'HEAD:src/components/planner/PlannerHome.tsx'],
    text=True,
)

text = text.replace('  optimizeStopsSequence,\n', '', 1)
state_line = "  const [optimizeUndo, setOptimizeUndo] = useState<{ key: string; places: PlannerTripPlace[] } | null>(null);\n"
if state_line not in text:
    raise SystemExit('optimizeUndo state line not found')
text = text.replace(state_line, '', 1)

handler_start = text.index('  const runRouteOptimization = useCallback(async () => {')
handler_end = text.index('  const placesByDate = useMemo(', handler_start)
text = text[:handler_start] + text[handler_end:]

ui_start_token = '''                <button
                  type="button"
                  onClick={() => void runRouteOptimization()}'''
ui_start = text.index(ui_start_token)
ui_end = text.index('                <a\n                  href={buildGoogleMapsRouteUrl', ui_start)
replacement = '''                <span
                  className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-800"
                  title={zh ? '真实交通时间优化通过本地 Ownly MCP 执行；网页不持有路由 API key' : 'Travel-time optimization runs through local Ownly MCP; the web app never holds the routing API key'}
                >
                  ⏱️ {zh ? 'MCP 真实交通优化' : 'MCP travel-time optimize'}
                </span>
'''
text = text[:ui_start] + replacement + text[ui_end:]

path.write_text(text, encoding='utf-8')
print('PlannerHome exact cleanup applied')
