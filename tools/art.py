"""用 OpenAI 图像模型给单词画统一风格的插画（在 GitHub Actions 里运行）。

- 密钥从环境变量 OPENAI_API_KEY 读（仓库 Settings → Secrets → Actions 里添加）
- sample：先画前 SAMPLE_N 个词，生成 art/review.html 看风格
- full：把 art/targets.json 里还没画的都画完（中途失败可以再跑，接着画）
- redo：重画 REDO 里列的词（英文，用逗号分隔），比如画得不像的
每张图缩成 256×256 的 webp（透明背景），写 art/index.json：{"model": ..., "files": {"词": "文件名"}}。
art/reject.json 里列的词游戏不用（审核时觉得不好的放这里）。
"""
import base64, hashlib, html, io, json, os, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

KEY = os.environ.get('OPENAI_API_KEY', '').strip()
MODE = os.environ.get('MODE', 'sample')
MODEL = os.environ.get('MODEL', '').strip() or 'gpt-image-1.5'
QUALITY = os.environ.get('QUALITY', '').strip() or 'low'
SAMPLE_N = int(os.environ.get('SAMPLE_N', '') or '12')
REDO = [w.strip() for w in os.environ.get('REDO', '').split(',') if w.strip()]
MIN_INTERVAL = float(os.environ.get('MIN_INTERVAL', '') or '4')
ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art'
STYLE = ('Cute flat vector illustration for a children\'s English vocabulary game. '
         'One single clear subject, centered, filling most of the frame. Thick dark brown outlines, '
         'soft bright pastel colors, simple shapes, friendly and cheerful, no background scenery. '
         'Absolutely no text, no letters, no numbers, no words anywhere in the image.')

if not KEY:
    sys.exit('没有找到密钥：请在仓库 Settings → Secrets and variables → Actions 里添加 OPENAI_API_KEY')

_lock = threading.Lock()
_last = [0.0]


def throttle():
    with _lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()


def prompt(t):
    hint = t.get('hint', '')
    return f'{STYLE}\nSubject: "{t["id"]}" (meaning in Chinese: {t["zh"]}). {hint}'.strip()


def generate(t) -> bytes:
    body = {'model': MODEL, 'prompt': prompt(t), 'size': '1024x1024', 'quality': QUALITY, 'background': 'transparent', 'output_format': 'png', 'n': 1}
    last = ''
    for attempt in range(7):
        throttle()
        req = urllib.request.Request('https://api.openai.com/v1/images/generations', data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {KEY}'})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return base64.b64decode(json.load(r)['data'][0]['b64_json'])
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:400]
            # 有的模型不支持透明背景或输出格式参数：去掉再试，之后自己抠白底
            for k in ('background', 'output_format'):
                if e.code == 400 and k in msg and k in body:
                    del body[k]
                    break
            else:
                if e.code in (429, 500, 502, 503) and attempt < 6:
                    ra = e.headers.get('Retry-After') if e.headers else None
                    wait = float(ra) if ra and ra.replace('.', '').isdigit() else min(5 * 2 ** attempt, 120)
                    print(f'  {e.code}，等 {wait:.0f} 秒：{t["id"]}')
                    time.sleep(wait)
                    continue
                last = f'OpenAI 返回 {e.code}：{msg}'
                break
        except urllib.error.URLError as ex:
            last = f'网络错误：{ex}'
            time.sleep(10)
    raise RuntimeError(last or '多次重试仍然失败')


def to_webp(png: bytes) -> bytes:
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    # 没有透明背景时，把接近白色的外围抠掉（从四角泛洪）
    if im.getextrema()[3][0] == 255:
        from PIL import ImageDraw
        w, h = im.size
        for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
            ImageDraw.floodfill(im, xy, (255, 255, 255, 0), thresh=40)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
    sq = sq.resize((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    sq.save(buf, 'WEBP', quality=82, method=6)
    return buf.getvalue()


def fname(t) -> str:
    return hashlib.sha1(f'{MODEL}|{QUALITY}|{t["id"]}|{t["zh"]}|{t.get("hint", "")}|{t.get("v", 0)}'.encode()).hexdigest()[:16] + '.webp'


def review_page(index, targets, reject):
    cells = []
    for t in targets:
        f = index.get(t['id'])
        bad = t['id'] in reject
        img = f'<img src="{f}" loading="lazy">' if f else '<div class="none">还没画</div>'
        cells.append(f'<figure class="{"bad" if bad else ""}">{img}<figcaption><b>{html.escape(t["id"])}</b> {html.escape(t["zh"])}{" · 不用" if bad else ""}</figcaption></figure>')
    page = f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插画审核</title>
<style>body{{font-family:-apple-system,sans-serif;background:#fff8ea;color:#4a3426;margin:12px}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}}figure{{margin:0;background:#fff;border:2px solid #d9cbb0;border-radius:12px;padding:6px;text-align:center}}
figure.bad{{opacity:.35}}img{{width:100%;aspect-ratio:1}}.none{{aspect-ratio:1;display:grid;place-items:center;color:#b7a88c}}figcaption{{font-size:13px}}</style>
<h2>插画审核（{len(index)}/{len(targets)} 张 · {html.escape(MODEL)}）</h2><p>画得不像、看不懂、有文字的，把英文发给 Claude，会放进"不用"或重画。</p>
<div class="g">{"".join(cells)}</div>'''
    (ART / 'review.html').write_text(page)


def main():
    targets = json.loads((ART / 'targets.json').read_text())
    by_id = {t['id']: t for t in targets}
    old = json.loads((ART / 'index.json').read_text()) if (ART / 'index.json').exists() else {}
    files = dict(old.get('files', {}))
    reject = set(json.loads((ART / 'reject.json').read_text())) if (ART / 'reject.json').exists() else set()
    if MODE == 'sample':
        todo = [t for t in targets[:SAMPLE_N] if not (ART / fname(t)).exists()]
    elif MODE == 'redo':
        todo = []
        for w in REDO:
            if w in by_id:
                t = dict(by_id[w], v=int(time.time()))  # 换个版本号，生成新文件
                by_id[w] = t
                todo.append(t)
        reject -= set(REDO)
    else:
        todo = [t for t in targets if not (files.get(t['id']) and (ART / files[t['id']]).exists())]
    print(f'模型 {MODEL}（{QUALITY}），要画 {len(todo)} 张')

    def work(t):
        try:
            f = fname(t)
            (ART / f).write_bytes(to_webp(generate(t)))
            return t['id'], f, None
        except Exception as e:
            return t['id'], None, str(e)

    failed = []
    done = 0
    with ThreadPoolExecutor(max_workers=2) as ex:
        for wid, f, err in ex.map(work, todo):
            if err:
                failed.append((wid, err))
            else:
                files[wid] = f
                done += 1
                if done % 25 == 0:
                    print(f'  已完成 {done}/{len(todo)}')
    files = {k: v for k, v in files.items() if k in by_id and (ART / v).exists()}
    keep = set(files.values())
    for p in ART.glob('*.webp'):
        if p.name not in keep:
            p.unlink()
    (ART / 'index.json').write_text(json.dumps({'model': MODEL, 'files': files}, ensure_ascii=False, separators=(',', ':')))
    (ART / 'reject.json').write_text(json.dumps(sorted(reject), ensure_ascii=False))
    review_page(files, targets, reject)
    print(f'完成：新画 {done} 张，失败 {len(failed)} 张；审核页 art/review.html')
    if failed:
        print(f'失败示例：{failed[0][0]}：{failed[0][1][:300]}')
        sys.exit(f'有 {len(failed)} 张失败，再跑一次 full 会接着画')


main()
