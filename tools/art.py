"""给单词画插画：画风统一，表达方式随阶段递进。在 GitHub Actions 里运行，用 Google Vertex AI。

为什么走 Vertex AI：Google Cloud 的 $300 试用金不能付 AI Studio 里 Gemini API 的费用，Vertex AI 可以。
密钥：仓库 Settings → Secrets → Actions 里的 VERTEX_API_KEY；密钥绑定了项目时再加 GCP_PROJECT（项目 ID）。

阶段和表达方式（和游戏 src/core/content/art.ts 一致）：
  starters 单个物体、单个动作 → movers 简单关系 → ket 日常情境 → pet 用清晰的情境表达较抽象的词
跨阶段的词：词义和教学情境一致时复用前一阶段的图，否则每个阶段各画一张。

两步：
1. plan（文字模型，便宜）：给每个"词×阶段"写一句画面描述，并判断跨阶段的词哪些阶段复用。写 art/plan.json。
   art/hints.json 里可以手写 {"词@阶段": "画面描述"} 覆盖模型写的。
2. 画图（图像模型 Nano Banana 2）：按画面描述画。
模式：
- plan：只做第 1 步（全部词），审核页 art/review.html 能看到每个画面描述
- sample：挑十几个词（含跨阶段的）规划并画出来，看画风和递进效果
- full：规划 + 画完全部；每画 LIMIT 张退出一次（退出码 10），由 workflow 提交后接着画
- redo：重画 REDO 里列的（"词" 表示这个词画过的所有阶段，"词@阶段" 只画那一个），先看 hints.json
画风参考：art/style/ 里的图片会随每次请求一起发给模型。
输出：256×256 透明背景 webp；art/index.json {"model", "complete", "files": {"词@阶段": "文件名"}}（复用的阶段指向同一个文件）。
art/reject.json 里列的（"词" 或 "词@阶段"）游戏不用。
"""
import base64, hashlib, html, io, json, os, re, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw

KEY = os.environ.get('VERTEX_API_KEY', '').strip()
PROJECT = os.environ.get('GCP_PROJECT', '').strip()
MODE = os.environ.get('MODE', 'sample')
MODEL = os.environ.get('MODEL', '').strip() or 'gemini-3.1-flash-image'
PLANNERS = [m for m in [os.environ.get('PLANNER', '').strip(), 'gemini-3.5-flash', 'gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'] if m]
SIZE = os.environ.get('SIZE', '').strip() or '512'
REDO = [w.strip() for w in os.environ.get('REDO', '').split(',') if w.strip()]
LIMIT = int(os.environ.get('LIMIT', '') or '400')
WORKERS = int(os.environ.get('WORKERS', '') or '3')
MIN_INTERVAL = float(os.environ.get('MIN_INTERVAL', '') or '2')
PRICE = float(os.environ.get('PRICE', '') or '0.045')  # 每张大约多少美元，只用来估算
PLAN_BATCH = 20
ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art'
STYLE_DIR = ART / 'style'
STAGES = ['starters', 'movers', 'ket', 'pet']
STAGE_ZH = {'starters': '启蒙 Starters', 'movers': 'Movers', 'ket': 'KET', 'pet': 'PET'}

# 看风格和递进效果用：有只在一个阶段的，也有跨两三个阶段的
SAMPLE = ['apple', 'pencil', 'happy', 'run', 'small', 'busy', 'kitchen', 'dangerous', 'celebrate', 'break', 'light',
          'borrow', 'opinion', 'compare', 'peace', 'vote']

STYLE = (
    "Illustration for a children's English vocabulary game. One consistent house style for every picture: "
    "soft rounded shapes, clean dark-brown outlines of even medium weight, flat colors with gentle simple shading, "
    "warm cheerful palette (cream, carrot orange, sky blue, leaf green, sunny yellow, soft pink), friendly faces with dot eyes. "
    "Square composition, the drawing isolated on a plain pure white background with white margin all around; "
    "no frame, no border, no full-bleed background. "
    "Absolutely no text, letters, numbers, words, signs with writing, or speech bubbles with writing anywhere."
)
STAGE_RULE = {
    'starters': 'Level: Starters (age 6-7). Show ONE single object, or ONE character doing ONE single action. Big, centered, very simple, nothing else in the picture.',
    'movers': 'Level: Movers (age 8-9). Show a simple relationship: two things or characters and how they relate (position, who does what to whom, bigger/smaller, part of). Keep it simple.',
    'ket': 'Level: KET (age 10-11). Show a small everyday-life situation (home, school, shop, street, park) in which the meaning is clear. Compact vignette.',
    'pet': 'Level: PET (age 11-13). Show a clear situation that makes the more abstract meaning unmistakable (cause and effect, contrast, feelings, choices). Compact vignette with 1-3 characters.',
}
PLAN_RULES = """You plan illustrations for a children's English vocabulary game for Chinese primary-school pupils (Cambridge path: Starters -> Movers -> KET -> PET).
For every word and every stage it is listed in, write ONE short visual scene description that an image model will draw in a fixed cute cartoon style.
How the meaning is expressed grows with the learner's level:
- starters (age 6-7): ONE single object, or ONE character doing ONE single action. Nothing else.
- movers (age 8-9): a simple relationship: two things or characters and how they relate (position, who does what to whom, bigger/smaller, part of).
- ket (age 10-11): a small everyday-life situation (home, school, shop, street, park) in which the meaning is clear.
- pet (age 11-13): a clear situation that makes a more abstract meaning unmistakable (cause and effect, contrast, feelings, choices); 1-3 characters.
Reuse rule for words listed in several stages: the earliest stage is always drawn. A later stage may reuse an earlier stage's picture ONLY when the word has the same meaning there AND the earlier picture is still the right teaching picture at the later level (typically a concrete noun such as a fruit, an animal or a school object). If the later stage teaches the word better with a relationship or a situation, or uses a different sense, write a new scene for it.
Scene descriptions: at most 35 English words, concrete and drawable, describe only what is visible; the meaning must be guessable with no text at all; never rely on letters, numbers, writing, signs, flags or logos; friendly cartoon children and adults; nothing scary or violent; prefer the sense given by the Chinese meaning and the example sentence.
Return JSON only: {"words":[{"id":"<word>","stages":{"<stage>":{"scene":"..."} or {"reuse":"<earlier stage>"}}}]} with every requested stage present."""

if not KEY:
    sys.exit('没有找到密钥：请在仓库 Settings → Secrets and variables → Actions 里添加 VERTEX_API_KEY')

_lock = threading.Lock()
_last = [0.0]
_size_ok = [True]  # 模型不认识 SIZE 时整轮都不再传


def throttle():
    with _lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()


def endpoint(model):
    base = os.environ.get('VERTEX_BASE') or 'https://aiplatform.googleapis.com/v1'
    path = f'/projects/{PROJECT}/locations/global' if PROJECT else ''
    return f'{base}{path}/publishers/google/models/{model}:generateContent'


def call(model, body, label):
    """调一次 generateContent，429/5xx 自动退避重试；返回 JSON。404 抛 LookupError（模型不存在）。"""
    last = ''
    for attempt in range(8):
        throttle()
        req = urllib.request.Request(endpoint(model), data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:500]
            if e.code == 404:
                raise LookupError(f'{model}：{msg[:200]}')
            if e.code == 400 and 'imageSize' in json.dumps(body.get('generationConfig', {})) and ('imageSize' in msg or 'image_size' in msg):
                del body['generationConfig']['imageConfig']['imageSize']
                if _size_ok[0]:
                    _size_ok[0] = False
                    print(f'  模型不支持 imageSize={SIZE}，改用默认尺寸')
                continue
            if e.code in (429, 500, 502, 503, 504) and attempt < 7:
                wait = min(10 * 2 ** attempt, 300)
                print(f'  {e.code}，等 {wait} 秒：{label}')
                time.sleep(wait)
                continue
            last = f'Vertex AI 返回 {e.code}：{msg}'
            break
        except (urllib.error.URLError, TimeoutError) as ex:
            last = f'网络错误：{ex}'
            time.sleep(15)
    raise RuntimeError(last or '多次重试仍然失败')


def parts_of(data):
    for c in data.get('candidates') or []:
        yield from (c.get('content') or {}).get('parts') or []


# ---------- 第 1 步：规划 ----------

def sig(t):
    return hashlib.sha1(json.dumps([t['id'], t['zh'], t['stages'], t.get('ex', '')], ensure_ascii=False).encode()).hexdigest()[:10]


_planner = [None]


def plan_batch(batch):
    req = [{'id': t['id'], 'meaning_zh': t['zh'], 'stages': t['stages'], **({'example': t['ex']} if t.get('ex') else {})} for t in batch]
    body = {'contents': [{'role': 'user', 'parts': [{'text': PLAN_RULES + '\n\nWords:\n' + json.dumps(req, ensure_ascii=False)}]}],
            'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.4}}
    models = [_planner[0]] if _planner[0] else PLANNERS
    for m in models:
        try:
            data = call(m, body, f'规划 {batch[0]["id"]}…')
        except LookupError as e:
            print(f'  文字模型不可用，换下一个：{e}')
            continue
        _planner[0] = m
        text = ''.join(p.get('text', '') for p in parts_of(data))
        text = re.sub(r'^```(?:json)?|```$', '', text.strip()).strip()
        return {w['id']: w.get('stages', {}) for w in json.loads(text).get('words', [])}
    raise RuntimeError('没有可用的文字模型：' + ', '.join(PLANNERS))


def clean_plan(t, stages):
    """检查模型给的规划：每个阶段都要有；最早阶段必须画；复用只能指向更早、并且自己画了的阶段。"""
    out = {}
    for i, st in enumerate(t['stages']):
        p = stages.get(st) or {}
        reuse = p.get('reuse')
        if i > 0 and reuse in t['stages'][:i]:
            while out[reuse].get('reuse'):
                reuse = out[reuse]['reuse']
            out[st] = {'reuse': reuse}
        elif p.get('scene'):
            out[st] = {'scene': str(p['scene']).strip()[:400]}
        else:
            return None
    return out


def make_plan(targets, words):
    path = ART / 'plan.json'
    plan = json.loads(path.read_text()) if path.exists() else {'words': {}}
    todo = [t for t in targets if t['id'] in words and plan['words'].get(t['id'], {}).get('sig') != sig(t)]
    if not todo:
        return plan, 0
    print(f'规划 {len(todo)} 个词（文字模型 {PLANNERS[0]} 起）')
    batches = [todo[i:i + PLAN_BATCH] for i in range(0, len(todo), PLAN_BATCH)]

    def work(batch):
        for attempt in range(3):
            try:
                got = plan_batch(batch)
                res = {}
                for t in batch:
                    c = clean_plan(t, got.get(t['id'], {}))
                    if c:
                        res[t['id']] = {'sig': sig(t), 'stages': c}
                missing = [t for t in batch if t['id'] not in res]
                if missing and attempt < 2 and len(missing) > len(batch) // 2:
                    continue
                return res, [t['id'] for t in missing]
            except (ValueError, KeyError) as e:
                print(f'  规划返回格式不对，重试：{e}')
        return {}, [t['id'] for t in batch]

    failed = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for k, (res, miss) in enumerate(ex.map(work, batches)):
            plan['words'].update(res)
            failed += miss
            if (k + 1) % 10 == 0:
                print(f'  规划 {k + 1}/{len(batches)} 批')
                path.write_text(json.dumps(plan, ensure_ascii=False, indent=0))
    plan['planner'] = _planner[0]
    path.write_text(json.dumps(plan, ensure_ascii=False, indent=0))
    if failed:
        print(f'  有 {len(failed)} 个词没规划好（下次再跑会补上）：{", ".join(failed[:10])}')
    return plan, len(todo) - len(failed)


# ---------- 第 2 步：画图 ----------

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


def prompt(job):
    p = f'{STYLE}\n{STAGE_RULE[job["stage"]]}\n'
    if REFS:
        p += 'Match the art style of the reference images exactly (line weight, colors, shading, how faces look). Do not copy their subjects.\n'
    p += f'The picture teaches the English word "{job["id"]}" (meaning in Chinese: {job["zh"]}).\nDraw this: {job["scene"]}'
    return p


def generate(job) -> bytes:
    gen = {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '1:1'}}
    if _size_ok[0]:
        gen['imageConfig']['imageSize'] = SIZE
    body = {'contents': [{'role': 'user', 'parts': REFS + [{'text': prompt(job)}]}], 'generationConfig': gen}
    reason = ''
    for _ in range(3):  # 偶尔只回文字不回图，再试
        data = call(MODEL, body, job['key'])
        for part in parts_of(data):
            inline = part.get('inlineData') or part.get('inline_data')
            if inline and inline.get('data'):
                return base64.b64decode(inline['data'])
        cands = data.get('candidates') or []
        reason = cands[0].get('finishReason') if cands else (data.get('promptFeedback') or {}).get('blockReason')
    raise RuntimeError(f'没有返回图片（{reason}）')


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


def fname(job) -> str:
    key = f'{MODEL}|{SIZE}|{REF_TAG}|{job["key"]}|{job["zh"]}|{job["scene"]}|{job.get("v", 0)}'
    return hashlib.sha1(key.encode()).hexdigest()[:16] + '.webp'


def jobs_for(targets, plan, hints, words=None):
    """要画的图：每个词每个"画"的阶段一张（复用的阶段不单独画）"""
    out = []
    for t in targets:
        if words is not None and t['id'] not in words:
            continue
        p = plan['words'].get(t['id'])
        if not p:
            continue
        for st in t['stages']:
            sp = p['stages'].get(st, {})
            key = f'{t["id"]}@{st}'
            scene = hints.get(key) or sp.get('scene')
            if scene and (not sp.get('reuse') or key in hints):
                out.append({'key': key, 'id': t['id'], 'zh': t['zh'], 'stage': st, 'scene': scene})
    return out


def resolve_index(targets, plan, hints, drawn):
    """词@阶段 → 文件；复用的阶段指向被复用阶段的文件"""
    files = {}
    for t in targets:
        p = plan['words'].get(t['id'])
        if not p:
            continue
        for st in t['stages']:
            key = f'{t["id"]}@{st}'
            sp = p['stages'].get(st, {})
            src = key if (key in hints or not sp.get('reuse')) else f'{t["id"]}@{sp["reuse"]}'
            if drawn.get(src):
                files[key] = drawn[src]
    return files


def review_page(targets, plan, hints, drawn, reject, title):
    rows = []
    for t in targets:
        p = plan['words'].get(t['id'])
        if not p:
            continue
        cells = []
        for st in t['stages']:
            key = f'{t["id"]}@{st}'
            sp = p['stages'].get(st, {})
            if sp.get('reuse') and key not in hints:
                cells.append(f'<td class="re">{STAGE_ZH[st]}<br>复用 {STAGE_ZH[sp["reuse"]]}</td>')
                continue
            f = drawn.get(key)
            bad = key in reject or t['id'] in reject
            img = f'<img src="{f}" loading="lazy">' if f else '<div class="none">还没画</div>'
            cells.append(f'<td class="{"bad" if bad else ""}">{img}<b>{STAGE_ZH[st]}</b>{" · 不用" if bad else ""}'
                         f'<small>{html.escape(hints.get(key) or sp.get("scene", ""))}</small></td>')
        rows.append(f'<tr><th>{html.escape(t["id"])}<br><span>{html.escape(t["zh"].split("；")[0])}</span></th>{"".join(cells)}</tr>')
    page = f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插画审核</title>
<style>body{{font-family:-apple-system,sans-serif;background:#fff8ea;color:#4a3426;margin:12px}}table{{border-collapse:separate;border-spacing:6px}}
th{{text-align:left;font-size:15px;min-width:90px;vertical-align:top}}th span{{font-weight:normal;font-size:13px}}
td{{background:#fff;border:2px solid #d9cbb0;border-radius:12px;padding:6px;width:150px;vertical-align:top;font-size:13px}}
td.bad{{opacity:.35}}td.re{{color:#9a8a70;text-align:center;vertical-align:middle;background:#f6efe0}}img,.none{{width:150px;height:150px;display:block}}
.none{{display:grid;place-items:center;color:#b7a88c;background:#faf5ea;border-radius:8px}}small{{display:block;color:#7a6a58;margin-top:4px}}</style>
<h2>{html.escape(title)}</h2><p>每行一个词，按阶段从左到右。画得不像、看不懂、递进不对的，把"词@阶段"（比如 run@ket）发给 Claude，会改画面描述重画或放进"不用"。</p>
<table>{"".join(rows)}</table>'''
    (ART / 'review.html').write_text(page)


def main():
    targets = json.loads((ART / 'targets.json').read_text())
    by_id = {t['id']: t for t in targets}
    hints = json.loads((ART / 'hints.json').read_text()) if (ART / 'hints.json').exists() else {}
    old = json.loads((ART / 'index.json').read_text()) if (ART / 'index.json').exists() else {}
    drawn = dict(old.get('drawn', {}))  # 词@阶段 → 实际画的文件（不含复用）
    reject = set(json.loads((ART / 'reject.json').read_text())) if (ART / 'reject.json').exists() else set()

    if MODE == 'sample':
        words = {w for w in SAMPLE if w in by_id}
    elif MODE == 'redo':
        words = {r.split('@')[0] for r in REDO if r.split('@')[0] in by_id}
        for r in REDO:
            if r.split('@')[0] not in by_id:
                print(f'  词表里没有：{r}')
    else:
        words = set(by_id)
    plan, newly_planned = make_plan(targets, words)

    if MODE == 'plan':
        todo = []
    elif MODE == 'redo':
        todo = []
        for job in jobs_for(targets, plan, hints, words):
            if job['key'] in REDO or job['id'] in REDO:
                todo.append(dict(job, v=int(time.time())))  # 换个版本号，生成新文件
        reject -= set(REDO)
    else:
        todo = [j for j in jobs_for(targets, plan, hints, words) if drawn.get(j['key']) != fname(j) or not (ART / fname(j)).exists()]
    total_jobs = len(jobs_for(targets, plan, hints))
    remaining_after = max(0, len(todo) - LIMIT) if MODE == 'full' else 0
    if MODE == 'full':
        todo = todo[:LIMIT]
    print(f'图像模型 {MODEL}（{SIZE}），画风参考 {len(REFS)} 张；规划好的词要画 {total_jobs} 张；这一轮画 {len(todo)} 张，约 ${len(todo) * PRICE:.2f}')

    def work(job):
        try:
            f = fname(job)
            (ART / f).write_bytes(to_webp(generate(job)))
            return job['key'], f, None
        except Exception as e:
            return job['key'], None, str(e)

    failed, done = [], 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for key, f, err in ex.map(work, todo):
            if err:
                failed.append((key, err))
                print(f'  失败 {key}：{err[:200]}')
            else:
                drawn[key] = f
                done += 1
                if done % 25 == 0:
                    print(f'  已完成 {done}/{len(todo)}')

    valid = {j['key'] for j in jobs_for(targets, plan, hints)}
    drawn = {k: v for k, v in drawn.items() if k in valid and (ART / v).exists()}
    keep = set(drawn.values())
    for p in ART.glob('*.webp'):
        if p.name not in keep:
            p.unlink()
    files = resolve_index(targets, plan, hints, drawn)
    pairs = sum(len(t['stages']) for t in targets)
    complete = len(files) == pairs
    (ART / 'index.json').write_text(json.dumps({'model': MODEL, 'complete': complete, 'files': files, 'drawn': drawn},
                                               ensure_ascii=False, separators=(',', ':')))
    (ART / 'reject.json').write_text(json.dumps(sorted(reject), ensure_ascii=False))
    planned = sum(1 for t in targets if t['id'] in plan['words'])
    review_page(targets, plan, hints, drawn, reject,
                f'插画审核：规划 {planned}/{len(targets)} 词 · 画了 {len(drawn)}/{total_jobs} 张 · 覆盖 {len(files)}/{pairs} 个"词×阶段" · {MODEL}')
    print(f'这一轮：新画 {done} 张，失败 {len(failed)} 张；已画 {len(drawn)}/{total_jobs}；覆盖 {len(files)}/{pairs}；审核页 art/review.html')
    if failed and done == 0:
        sys.exit(f'全部失败，示例：{failed[0][0]}：{failed[0][1][:400]}')
    # 退出码 10 = 还有要画的，workflow 提交后接着画
    if MODE == 'full' and (remaining_after > 0 or (failed and done > 0) or (planned < len(targets) and newly_planned > 0)):
        sys.exit(10)


main()
