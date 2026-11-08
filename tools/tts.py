"""用 Google Cloud Text-to-Speech 生成单词和例句的发音（在 GitHub Actions 里运行）。

- 密钥从环境变量 GOOGLE_TTS_API_KEY 读（仓库 Settings → Secrets → Actions 里配置），不写进代码
- sample 模式：几个词 × 几种声音，生成 audio/samples.html 给家长试听挑声音
- full 模式：读 audio/texts.json（游戏构建时生成的全部要读的文字），只生成还没有的，
  写 audio/index.json：{"voice": ..., "files": {"文字": "文件名.mp3"}}
文件名 = 声音 + 语速 + 文字的哈希，换声音或改文字会自动重新生成。
"""
import base64, hashlib, html, json, os, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

KEY = os.environ.get('GOOGLE_TTS_API_KEY', '').strip()
MODE = os.environ.get('MODE', 'sample')
VOICE = os.environ.get('VOICE', '').strip() or 'en-US-Chirp3-HD-Leda'
RATE = float(os.environ.get('RATE', '') or '0.9')
ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / 'audio'
API = 'https://texttospeech.googleapis.com/v1/text:synthesize?key='

if not KEY:
    sys.exit('没有找到密钥：请在仓库 Settings → Secrets and variables → Actions 里添加 GOOGLE_TTS_API_KEY')


def synth(text: str, voice: str, rate: float) -> bytes:
    lang = '-'.join(voice.split('-')[:2])
    body = {'input': {'text': text}, 'voice': {'languageCode': lang, 'name': voice}, 'audioConfig': {'audioEncoding': 'MP3', 'speakingRate': rate}}
    for attempt in range(6):
        req = urllib.request.Request(API + KEY, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return base64.b64decode(json.load(r)['audioContent'])
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:300]
            if e.code == 400 and 'speaking' in msg.lower() and 'speakingRate' in body['audioConfig']:
                # 有的声音不支持调语速，去掉再试
                del body['audioConfig']['speakingRate']
                continue
            if e.code in (429, 500, 503) and attempt < 5:
                time.sleep(2 ** attempt)
                continue
            raise SystemExit(f'Google 返回错误 {e.code}：{msg}')
        except urllib.error.URLError:
            time.sleep(2 ** attempt)
    raise SystemExit('多次重试仍然失败')


def fname(text: str, voice: str, rate: float) -> str:
    return hashlib.sha1(f'{voice}|{rate}|{text}'.encode()).hexdigest()[:16] + '.mp3'


def sample():
    voices = ['en-US-Chirp3-HD-Leda', 'en-US-Chirp3-HD-Aoede', 'en-US-Chirp3-HD-Kore', 'en-US-Chirp3-HD-Puck', 'en-US-Chirp3-HD-Charon', 'en-US-Neural2-F']
    texts = ['apple', 'elephant', 'beautiful', 'give up', "Don't give up! You can do it."]
    out = AUDIO / 'samples'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for v in voices:
        cells = []
        for t in texts:
            try:
                f = fname(t, v, RATE)
                (out / f).write_bytes(synth(t, v, RATE))
                cells.append(f'<td>{html.escape(t)}<br><audio controls preload="none" src="samples/{f}"></audio></td>')
            except SystemExit as e:
                cells.append(f'<td>{html.escape(t)}<br>失败：{html.escape(str(e))}</td>')
        rows.append(f'<tr><th>{v.split("-")[-1]}<br><small>{v}</small></th>{"".join(cells)}</tr>')
    page = f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>发音试听</title><style>body{{font-family:-apple-system,sans-serif;padding:12px;background:#fff8ea;color:#4a3426}}
table{{border-collapse:collapse}}td,th{{border:1px solid #d9cbb0;padding:8px;vertical-align:top}}audio{{width:150px}}</style>
<h2>单词守卫 · 发音试听（语速 {RATE}）</h2><p>每行一种声音。听完告诉 Claude 选哪个（比如 Leda）。</p>
<div style="overflow-x:auto"><table>{"".join(rows)}</table></div>'''
    (AUDIO / 'samples.html').write_text(page)
    print('试听页已生成：audio/samples.html')


def full():
    texts = json.loads((AUDIO / 'texts.json').read_text())
    old = json.loads((AUDIO / 'index.json').read_text()) if (AUDIO / 'index.json').exists() else {}
    files = {}
    todo = []
    for t in texts:
        f = fname(t, VOICE, RATE)
        files[t] = f
        if not (AUDIO / f).exists():
            todo.append((t, f))
    print(f'共 {len(texts)} 条，需要新生成 {len(todo)} 条（声音 {VOICE}，语速 {RATE}）')

    def work(item):
        t, f = item
        (AUDIO / f).write_bytes(synth(t, VOICE, RATE))
        return f

    done = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        for _ in ex.map(work, todo):
            done += 1
            if done % 200 == 0:
                print(f'  已完成 {done}/{len(todo)}')
    # 删掉不再用到的旧文件
    keep = set(files.values())
    removed = 0
    for p in AUDIO.glob('*.mp3'):
        if p.name not in keep:
            p.unlink()
            removed += 1
    (AUDIO / 'index.json').write_text(json.dumps({'voice': VOICE, 'rate': RATE, 'files': files}, ensure_ascii=False, separators=(',', ':')))
    print(f'完成：新生成 {done} 条，删掉旧文件 {removed} 个；上次是 {old.get("voice", "无")}')


sample() if MODE == 'sample' else full()
