"""用 Google Vertex AI 的 Gemini 图像模型（Nano Banana）给单词画统一风格的插画，在 GitHub Actions 里运行。

为什么走 Vertex AI：Google Cloud 的 $300 试用金不能付 AI Studio 里 Gemini API 的费用，Vertex AI 可以。
- 密钥：仓库 Settings → Secrets → Actions 里的 VERTEX_API_KEY（Vertex AI / Agent Platform 的 API 密钥）
  如果密钥绑定了项目，再加一个 GCP_PROJECT（项目 ID）；不加就走 express mode 的无项目地址。
- sample：画 SAMPLE 列的十几个不同类型的词，看风格
- full：把 art/targets.json 里还没画的画完；每画 LIMIT 张就退出一次，由 workflow 提交、再接着画
- redo：重画 REDO 里列的词（英文，逗号分隔）
- 画风参考：art/style/ 里的图片（审核 sample 后挑 2~3 张放进去）会随每次请求一起发给模型，保持画风一致
每张图缩成 256×256 透明背景 webp，写 art/index.json：{"model": ..., "complete": bool, "files": {"词": "文件名"}}。
art/reject.json 里列的词游戏不用。
"""
import base64, hashlib, html, io, json, os, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw

KEY = os.environ.get('VERTEX_API_KEY', '').strip()
PROJECT = os.environ.get('GCP_PROJECT', '').strip()
MODE = os.environ.get('MODE', 'sample')
MODEL = os.environ.get('MODEL', '').strip() or 'gemini-3.1-flash-image'
SIZE = os.environ.get('SIZE', '').strip() or '512'
REDO = [w.strip() for w in os.environ.get('REDO', '').split(',') if w.strip()]
LIMIT = int(os.environ.get('LIMIT', '') or '400')
WORKERS = int(os.environ.get('WORKERS', '') or '3')
MIN_INTERVAL = float(os.environ.get('MIN_INTERVAL', '') or '2')
PRICE = float(os.environ.get('PRICE', '') or '0.045')  # 每张大约多少美元，只用来估算
ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art'
STYLE_DIR = ART / 'style'

# 看风格用：各档、各种词性都有
SAMPLE = ['apple', 'cat', 'bus', 'happy', 'run', 'grandmother', 'kitchen', 'dentist', 'borrow', 'dangerous',
          'opinion', 'decide', 'environment', 'celebrate', 'nervous', 'compare']

STYLE = (
    "Illustration for a children's English vocabulary game (ages 6-12). One consistent house style for every card: "
    "soft rounded shapes, clean dark-brown outlines of even medium weight, flat colors with gentle simple shading, "
    "warm cheerful palette (cream, carrot orange, sky blue, leaf green, sunny yellow, soft pink), friendly faces with dot eyes. "
    "Square composition, the drawing isolated on a plain pure white background with white margin all around; "
    "no frame, no border, no ground shadow patch, no background scenery fill. "
    "Absolutely no text, letters, numbers, words, signs with writing, or speech bubbles with writing anywhere."
)
TIER = {
    'young': 'Draw ONE single object, animal, person or action, big and centered, very simple, instantly recognizable by a 6-year-old.',
    'middle': 'Draw the main subject big and centered; you may add one or two small supporting items so a 9-year-old understands the meaning clearly.',
    'upper': ('If the word is a concrete thing, draw it big and clear. If it is an action, feeling, quality or idea, '
              'draw a small compact scene (a vignette on white) with one or two cartoon kids acting it out, so an 11-year-old can guess the meaning.'),
}

if not KEY:
    sys.exit('没有找到密钥：请在仓库 Settings → Secrets and variables → Actions 里添加 VERTEX_API_KEY')

_lock = threading.Lock()
_size_ok = [True]  # 模型不认识 SIZE 时整轮都不再传
_last = [0.0]


def throttle():
    with _lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()


def style_refs():
    refs = sorted(p for p in STYLE_DIR.glob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))[:4]
    out = []
    for p in refs:
        im = Image.open(p).convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        buf = io.BytesIO()
        bg.save(buf, 'PNG')
        out.append({'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(buf.getvalue()).decode()}})
    return out


REFS = style_refs()
REF_TAG = hashlib.sha1(b''.join(r['inlineData']['data'].encode() for r in REFS)).hexdigest()[:6] if REFS else ''


def prompt(t):
    p = f'{STYLE}\n{TIER.get(t.get("tier"), TIER["middle"])}\n'
    if REFS:
        p += 'Match the art style of the reference images exactly (line weight, colors, shading, how faces look). Do not copy their subjects.\n'
    p += f'The word to illustrate: "{t["id"]}" (meaning in Chinese: {t["zh"]}).'
    if t.get('ex'):
        p += f' Illustrate the sense used in this sentence: "{t["ex"]}"'
    if t.get('hint'):
        p += f' {t["hint"]}'
    return p


def endpoint():
    base = os.environ.get('VERTEX_BASE') or 'https://aiplatform.googleapis.com/v1'
    path = f'/projects/{PROJECT}/locations/global' if PROJECT else ''
    return f'{base}{path}/publishers/google/models/{MODEL}:generateContent'


def generate(t) -> bytes:
    gen = {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '1:1'}}
    if _size_ok[0]:
        gen['imageConfig']['imageSize'] = SIZE
    body = {'contents': [{'role': 'user', 'parts': REFS + [{'text': prompt(t)}]}], 'generationConfig': gen}
    last = ''
    for attempt in range(8):
        throttle()
        req = urllib.request.Request(endpoint(), data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            cands = data.get('candidates') or []
            for c in cands:
                for part in (c.get('content') or {}).get('parts') or []:
                    inline = part.get('inlineData') or part.get('inline_data')
                    if inline and inline.get('data'):
                        return base64.b64decode(inline['data'])
            reason = cands[0].get('finishReason') if cands else (data.get('promptFeedback') or {}).get('blockReason')
            last = f'没有返回图片（{reason}）'
            if attempt < 2:
                continue  # 偶尔只回文字，重试一次
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:500]
            # 不认识的参数（尺寸）去掉再试，用默认 1K
            if e.code == 400 and 'imageSize' in gen.get('imageConfig', {}) and ('imageSize' in msg or 'image_size' in msg):
                del gen['imageConfig']['imageSize']
                if _size_ok[0]:
                    _size_ok[0] = False
                    print(f'  模型不支持 imageSize={SIZE}，改用默认尺寸')
                continue
            if e.code in (429, 500, 502, 503, 504) and attempt < 7:
                wait = min(10 * 2 ** attempt, 300)
                print(f'  {e.code}，等 {wait} 秒：{t["id"]}')
                time.sleep(wait)
                continue
            last = f'Vertex AI 返回 {e.code}：{msg}'
            break
        except (urllib.error.URLError, TimeoutError) as ex:
            last = f'网络错误：{ex}'
            time.sleep(15)
    raise RuntimeError(last or '多次重试仍然失败')


def to_webp(png: bytes) -> bytes:
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    # 白底抠掉：从四边泛洪，只去掉和外围连着的白色
    if im.getextrema()[3][0] == 255:
        w, h = im.size
        for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
            if im.getpixel(xy)[3] and min(im.getpixel(xy)[:3]) > 225:
                ImageDraw.floodfill(im, xy, (255, 255, 255, 0), thresh=30)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) * 1.04)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
    sq = sq.resize((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    sq.save(buf, 'WEBP', quality=82, method=6)
    return buf.getvalue()


def fname(t) -> str:
    key = f'{MODEL}|{SIZE}|{REF_TAG}|{t["id"]}|{t["zh"]}|{t.get("tier")}|{t.get("ex", "")}|{t.get("hint", "")}|{t.get("v", 0)}'
    return hashlib.sha1(key.encode()).hexdigest()[:16] + '.webp'


TIER_ZH = {'young': '启蒙', 'middle': 'KET/三到五年级', 'upper': 'PET'}


def review_page(index, targets, reject, title):
    groups = {}
    for t in targets:
        groups.setdefault(t.get('tier', 'middle'), []).append(t)
    parts = []
    for tier, ts in groups.items():
        cells = []
        for t in ts:
            f = index.get(t['id'])
            if not f:
                continue
            bad = t['id'] in reject
            cells.append(f'<figure class="{"bad" if bad else ""}"><img src="{f}" loading="lazy"><figcaption><b>{html.escape(t["id"])}</b> '
                         f'{html.escape(t["zh"].split("；")[0])}{" · 不用" if bad else ""}</figcaption></figure>')
        parts.append(f'<h3>{TIER_ZH.get(tier, tier)}（{len(cells)}/{len(ts)}）</h3><div class="g">{"".join(cells)}</div>')
    page = f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插画审核</title>
<style>body{{font-family:-apple-system,sans-serif;background:#fff8ea;color:#4a3426;margin:12px}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}}figure{{margin:0;background:#fff;border:2px solid #d9cbb0;border-radius:12px;padding:6px;text-align:center}}
figure.bad{{opacity:.35}}img{{width:100%;aspect-ratio:1}}figcaption{{font-size:13px}}</style>
<h2>{html.escape(title)}</h2><p>画得不像、看不懂、有文字的，把英文发给 Claude，会放进"不用"或重画。</p>{"".join(parts)}'''
    (ART / 'review.html').write_text(page)


def main():
    targets = json.loads((ART / 'targets.json').read_text())
    by_id = {t['id']: t for t in targets}
    old = json.loads((ART / 'index.json').read_text()) if (ART / 'index.json').exists() else {}
    files = dict(old.get('files', {}))
    reject = set(json.loads((ART / 'reject.json').read_text())) if (ART / 'reject.json').exists() else set()
    if MODE == 'sample':
        todo = [by_id[w] for w in SAMPLE if w in by_id and not (ART / fname(by_id[w])).exists()]
        files.update({w: fname(by_id[w]) for w in SAMPLE if w in by_id})
    elif MODE == 'redo':
        todo = []
        for w in REDO:
            if w in by_id:
                t = dict(by_id[w], v=int(time.time()))  # 换个版本号，生成新文件
                todo.append(t)
            else:
                print(f'  词表里没有：{w}')
        reject -= set(REDO)
    else:
        todo = [t for t in targets if not (files.get(t['id']) and (ART / files[t['id']]).exists())]
    remaining_after = max(0, len(todo) - LIMIT) if MODE == 'full' else 0
    todo = todo[:LIMIT] if MODE == 'full' else todo
    print(f'模型 {MODEL}（{SIZE}），画风参考 {len(REFS)} 张，这一轮画 {len(todo)} 张，约 ${len(todo) * PRICE:.2f}')

    def work(t):
        try:
            f = fname(t)
            (ART / f).write_bytes(to_webp(generate(t)))
            return t['id'], f, None
        except Exception as e:
            return t['id'], None, str(e)

    failed = []
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for wid, f, err in ex.map(work, todo):
            if err:
                failed.append((wid, err))
                print(f'  失败 {wid}：{err[:200]}')
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
    complete = all(t['id'] in files for t in targets)
    (ART / 'index.json').write_text(json.dumps({'model': MODEL, 'complete': complete, 'files': files}, ensure_ascii=False, separators=(',', ':')))
    (ART / 'reject.json').write_text(json.dumps(sorted(reject), ensure_ascii=False))
    review_page(files, targets, reject, f'插画审核（{len(files)}/{len(targets)} 张 · {MODEL} · 画风参考 {len(REFS)} 张）')
    print(f'这一轮：新画 {done} 张，失败 {len(failed)} 张；全部 {len(files)}/{len(targets)}；审核页 art/review.html')
    if failed and done == 0:
        sys.exit(f'全部失败，示例：{failed[0][0]}：{failed[0][1][:400]}')
    # 退出码 10 = 还有要画的，workflow 提交后接着画
    if MODE == 'full' and (remaining_after > 0 or (failed and done > 0)):
        sys.exit(10)


main()
