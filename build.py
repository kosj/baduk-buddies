"""src/ 의 소스를 합쳐 배포용 index.html 을 만든다.

신경망 가중치(nn/kata-b10c128.wasm)는 따로 만들어 둔 파일을 그대로 쓴다.
다시 만들려면 README의 '신경망 다시 만들기'를 참고.
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / 'src'

template = (SRC / 'template.html').read_text(encoding='utf-8')
parts = {
    '/*__ENGINE__*/': (SRC / 'engine.js').read_text(encoding='utf-8'),
    '/*__NNJS__*/': (SRC / 'nn' / 'nnjs.js').read_text(encoding='utf-8'),
    '/*__PRO__*/': (SRC / 'nn' / 'pro.js').read_text(encoding='utf-8'),
    '/*__WASM__*/': base64.b64encode((SRC / 'nn' / 'nn.wasm').read_bytes()).decode(),
    '/*__META__*/': json.dumps(json.loads((SRC / 'nn' / 'kata.json').read_text()), separators=(',', ':')),
    '/*__JANGGI__*/': (SRC / 'janggi.js').read_text(encoding='utf-8'),
    '/*__JANGGI_UI__*/': (SRC / 'janggi-ui.js').read_text(encoding='utf-8'),
    '/*__FX__*/': (SRC / 'fx.js').read_text(encoding='utf-8'),
    '/*__HOME__*/': (SRC / 'home.js').read_text(encoding='utf-8'),
}
for key, value in parts.items():
    assert template.count(key) == 1, key
    template = template.replace(key, value)

(ROOT / 'index.html').write_text(template, encoding='utf-8')
print('index.html', len(template), 'bytes')
