import json
from pathlib import Path

version = '0.3.0'

package_path = Path('packages/mcp/package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = version
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

server_path = Path('server.json')
server = json.loads(server_path.read_text(encoding='utf-8'))
server['version'] = version
server['packages'][0]['version'] = version
server_path.write_text(json.dumps(server, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

index_path = Path('packages/mcp/src/index.mjs')
index = index_path.read_text(encoding='utf-8')
old = "const SERVER_VERSION = '0.2.0';"
new = f"const SERVER_VERSION = '{version}';"
if index.count(old) != 1:
    raise RuntimeError('Expected exactly one MCP SERVER_VERSION 0.2.0 declaration')
index_path.write_text(index.replace(old, new, 1), encoding='utf-8')

print('Prepared MCP 0.3.0 release metadata')
