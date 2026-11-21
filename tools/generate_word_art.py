#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Word Guard (单词守卫) — 分级递进式 AI 插画批量生成与 GitHub 自动同步脚本
适用环境：Google Cloud Shell（直接抵扣 Google Cloud 免费试用赠金）或本地 Python 环境

核心特性：
1. 仓库现状自检 (--inspect)：
   - 一键扫描 index.html 词表结构、各阶段词数、跨阶段重复词数量，以及 art/index.json 与 art/reject.json 覆盖率。
2. 统一画风 + 四阶认知递进（全阶段针对手机端 64x64px 小卡片做特写级高辨识度优化）：
   - 启蒙阶段 (Starters / 一二年级)：突出单个物体与核心动作，纯净无干扰背景
   - 进阶阶段 (Movers / 三四年级)：加入两个主体间的简单空间、对比或互动关系
   - 日常阶段 (KET / 五年级)：用“近景局部特写 + 1个标志性日常道具”表达日常情境，拒绝全景小人
   - 抽象情境阶段 (PET)：用“大头半身微距特写 + 夸张神态 + 1个因果符号”表达抽象词义，拒绝复杂房间背景
3. 跨阶段词（693 词）智能复用与分流：
   - 使用 Vertex AI Gemini 2.5 Flash 先对同词跨阶段条目做“词义 + 教学情境一致性”判定：
     * 若词义相同且教学表达一致（如具体名词 apple/cat），复用同一张图（key: "apple"）
     * 若词义不同（如 park 公园/停车）或需随阶段升级表达方式，则自动拆分为独立素材
       （key: "word__tier1_starter", "word__tier4_pet"），最终支持超过 3,112 张的精细化图库。
4. 断点续传、试跑模式 (--limit) 与自动同步 (--git-push)：
   - 每生成一张即刻写入 art/ 目录并更新 art/index.json，随时中断可续跑。
"""

import argparse
import io
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Dict, List

try:
    from PIL import Image
except ImportError:
    print("正在安装 Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "Pillow"])
    from PIL import Image

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("正在安装 google-genai SDK...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "google-genai"])
    from google import genai
    from google.genai import types


# ============================================================================
# 1. 统一视觉画风锚点 (Unified Style Anchor) 与移动端特写级四阶段教学法模板
# ============================================================================

UNIFIED_STYLE_ANCHOR = (
    "A clean, modern children's educational app icon illustration in a unified "
    "flat-vector storybook style with bold rounded dark-brown outlines, high-contrast "
    "warm palette, gentle cel-shading, centered 1:1 square composition on a solid soft "
    "pastel background. Designed for instant legibility at 64x64px on a mobile phone screen: "
    "main subject MUST fill 75%-85% of the frame, max 2 visual elements total, zero background "
    "room clutter, no tiny distant full-body figures. Strictly NO text, NO letters, NO words, "
    "NO numbers, NO watermarks."
)

STAGE_PEDAGOGY_RULES = {
    "tier1_starter": {
        "name": "启蒙阶段（Starters / 一二年级）",
        "rule": (
            "Focus strictly on a SINGLE clear object or a SINGLE character performing one "
            "unambiguous action filling 80% of the center frame. Solid clean background with "
            "zero secondary props."
        ),
    },
    "tier2_movers": {
        "name": "初级进阶（Movers / 三四年级）",
        "rule": (
            "Illustrate a SIMPLE relationship between two clear, large elements (spatial "
            "position, size comparison, or direct interaction) filling 80% of the frame. "
            "Use bold visual contrast and zero background clutter."
        ),
    },
    "tier3_ket": {
        "name": "日常情境阶段（KET / 五年级 — 手机端近景符号化特写）",
        "rule": (
            "Express an EVERYDAY real-life scenario using a TIGHT CLOSE-UP (hands, objects, "
            "or waist-up interaction filling 80% of the frame) paired with ONLY 1 iconic "
            "contextual prop (e.g., two hands exchanging a barcoded book with a curved arrow "
            "for 'borrow', rather than a wide library room). Never draw wide rooms, bookshelves, "
            "or full-body distant scenes."
        ),
    },
    "tier4_pet": {
        "name": "抽象表达阶段（PET — 手机端微距神态+因果符号特写）",
        "rule": (
            "Express abstract concepts, emotions, or nuanced verbs/adjectives using a MACRO "
            "CLOSE-UP (head-and-shoulders bust or tight focal interaction filling 80% of the "
            "frame) with exaggerated, unmistakable facial expressions/gestures plus ONLY 1 "
            "bold cause-and-effect symbol right beside the subject (e.g., a sweating worried "
            "face biting nails next to a large red ticking clock for 'anxious', on a clean "
            "solid pastel background). Never draw full rooms or tiny background details."
        ),
    },
}


def classify_pedagogical_tier(level_or_book: str) -> str:
    """根据词条所属路线/课本映射到四个递进教学阶段。"""
    s = (level_or_book or "").lower()
    if any(k in s for k in ["starter", "一年级", "二年级", "1a", "1b", "2a", "2b", "grade 1", "grade 2"]):
        return "tier1_starter"
    if any(k in s for k in ["mover", "三年级", "四年级", "3a", "3b", "4a", "4b", "grade 3", "grade 4"]):
        return "tier2_movers"
    if any(k in s for k in ["ket", "a2", "五年级", "5a", "5b", "grade 5"]):
        return "tier3_ket"
    if any(k in s for k in ["pet", "b1"]):
        return "tier4_pet"
    return "tier1_starter"


def is_phase1_target(level_or_book: str) -> bool:
    """判断是否为第一批优先覆盖范围（Starters + 一二年级课本，约 600 张）。"""
    s = (level_or_book or "").lower()
    return any(
        k in s
        for k in ["starter", "启蒙 starters", "一年级", "二年级", "1a", "1b", "2a", "2b"]
    )


# ============================================================================
# 2. 解析 index.html 词库与现有 art/index.json
# ============================================================================

def extract_words_from_index_html(html_path: Path) -> List[Dict]:
    """
    从 Word Guard 的单文件 index.html（或同目录词表 JSON）中提取所有单词词条。
    返回格式列表: [{"word": "apple", "meaning": "苹果", "source": "剑桥启蒙 Starters", "tier": "tier1_starter"}, ...]
    """
    if not html_path.exists():
        raise FileNotFoundError(f"未找到 {html_path}，请确认在 word-guard 仓库根目录下运行。")

    content = html_path.read_text(encoding="utf-8")
    entries: List[Dict] = []

    obj_pattern = re.compile(
        r"\{[^{}]*?\b(?:word|w)\s*:\s*['\"]([^'\"]+)['\"][^{}]*?\}",
        re.DOTALL,
    )
    for match in obj_pattern.finditer(content):
        block = match.group(0)
        word_m = re.search(r"\b(?:word|w)\s*:\s*['\"]([^'\"]+)['\"]", block)
        if not word_m:
            continue
        word = word_m.group(1).strip()

        meaning_m = re.search(
            r"\b(?:meaning|cn|trans|zh|def)\s*:\s*['\"]([^'\"]+)['\"]", block
        )
        meaning = meaning_m.group(1).strip() if meaning_m else ""

        source_m = re.search(
            r"\b(?:level|category|stage|textbook|book|route|group|unit)\s*:\s*['\"]([^'\"]+)['\"]",
            block,
        )
        source = source_m.group(1).strip() if source_m else "Starters"

        entries.append(
            {
                "word": word,
                "meaning": meaning,
                "source": source,
                "tier": classify_pedagogical_tier(source),
            }
        )

    print(f"[词库解析] 从 {html_path.name} 中提取到 {len(entries)} 条原始词条记录。")
    return entries


def load_art_index(index_json_path: Path) -> Dict:
    """读取现有的 art/index.json，若不存在则初始化空字典。"""
    if index_json_path.exists():
        try:
            data = json.loads(index_json_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return {k: f"{k}.webp" for k in data}
            if isinstance(data, dict):
                return data
        except Exception as e:
            print(f"[警告] 读取 {index_json_path} 失败 ({e})，将创建新索引。")
    return {}


def save_art_index(index_json_path: Path, art_index: Dict) -> None:
    """保存更新后的 art/index.json。"""
    index_json_path.parent.mkdir(parents=True, exist_ok=True)
    index_json_path.write_text(
        json.dumps(art_index, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def inspect_repository(repo_root: Path) -> None:
    """扫描并打印仓库现状：词库分布、跨阶段词统计、art/ 目录与索引覆盖率。"""
    html_path = repo_root / "index.html"
    art_dir = repo_root / "art"
    index_json_path = art_dir / "index.json"
    reject_json_path = art_dir / "reject.json"

    print("============================================================")
    print("         Word Guard 仓库配图与词库现状诊断报告")
    print("============================================================")
    entries = extract_words_from_index_html(html_path)
    tier_counts = Counter(e["tier"] for e in entries)
    word_occurrences: Dict[str, List[Dict]] = {}
    for e in entries:
        word_occurrences.setdefault(e["word"].lower(), []).append(e)

    multi_stage_words = {w: occs for w, occs in word_occurrences.items() if len(occs) > 1}
    art_index = load_art_index(index_json_path)
    reject_list = []
    if reject_json_path.exists():
        try:
            reject_list = json.loads(reject_json_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    existing_files = list(art_dir.glob("*.*")) if art_dir.exists() else []
    ext_counts = Counter(f.suffix.lower() for f in existing_files)

    print(f"1. 词条总数          : {len(entries)} 条（去重后独立单词: {len(word_occurrences)} 个）")
    print(f"2. 跨阶段重复出现词  : {len(multi_stage_words)} 个")
    print("3. 四阶段词条分布    :")
    for tier_key, info in STAGE_PEDAGOGY_RULES.items():
        print(f"   - {info['name']}: {tier_counts.get(tier_key, 0)} 条")
    print(f"4. art/index.json    : 已收录 {len(art_index)} 条索引记录")
    print(f"5. art/reject.json   : 已收录 {len(reject_list)} 条剔除记录")
    print(f"6. art/ 物理文件格式 : {dict(ext_counts)}")
    print("============================================================")


# ============================================================================
# 3. 跨阶段词复用判定 + 分级画面 Prompt 生成 (Vertex AI Gemini 2.5 Flash)
# ============================================================================

def plan_visual_tasks_for_word(
    client: genai.Client,
    word: str,
    occurrences: List[Dict],
) -> List[Dict]:
    """
    针对某一个单词在各阶段的出现记录：
    - 若只出现 1 次，直接根据对应阶段生成 1 条生图任务；
    - 若跨阶段出现多次（693 个跨阶段词），调用 Gemini 2.5 Flash 判断：
      只有当【词义】与【教学情境/认知表达】一致时才复用同一张图片，否则按阶段拆分为多张独立图片。
    """
    unique_usages = {}
    for occ in occurrences:
        key = (occ["tier"], occ.get("meaning", ""))
        if key not in unique_usages:
            unique_usages[key] = occ

    usages_list = list(unique_usages.values())

    sys_instruction = (
        "You are an expert English curriculum art director designing mobile-first (64x64px "
        "legible) flashcard illustrations for Chinese primary/middle school students across 4 stages:\n"
        f"- tier1_starter: {STAGE_PEDAGOGY_RULES['tier1_starter']['rule']}\n"
        f"- tier2_movers: {STAGE_PEDAGOGY_RULES['tier2_movers']['rule']}\n"
        f"- tier3_ket: {STAGE_PEDAGOGY_RULES['tier3_ket']['rule']}\n"
        f"- tier4_pet: {STAGE_PEDAGOGY_RULES['tier4_pet']['rule']}\n\n"
        "MOBILE LEGIBILITY RULE (CRITICAL):\n"
        "Every scene_description MUST use a TIGHT CLOSE-UP or MACRO BUST framing filling 80% "
        "of the icon with at most 2 large visual elements on a clean solid background. NEVER "
        "describe full rooms, distant full-body characters, or complex background furniture.\n\n"
        "CROSS-STAGE REUSE RULE:\n"
        "When a word appears in multiple stages, ONLY reuse a single illustration if BOTH "
        "the word meaning (sense) AND the pedagogical visual scenario are completely appropriate "
        "to share (for example, concrete nouns like 'apple', 'cat', 'bus'). "
        "If the meaning differs across stages OR if a higher stage (like KET/PET) benefits from "
        "a richer close-up contextual cue than Starters, DO NOT reuse—create separate visual "
        "tasks with distinct asset_key values (e.g. 'word' for the primary/starter sense and "
        "'word__tier3_ket' or 'word__tier4_pet' for stage-specific scenes).\n"
        "Respond strictly in JSON format: a list of objects with keys: "
        "['asset_key', 'tier', 'meaning', 'scene_description']."
    )

    user_prompt = (
        f"Word: '{word}'\n"
        f"Occurrences across curriculum stages: {json.dumps(usages_list, ensure_ascii=False)}\n"
        "Generate the JSON list of visual illustration tasks. Each 'scene_description' must "
        "be a concrete 1-2 sentence English close-up visual description without any text/letters/numbers."
    )

    try:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=sys_instruction,
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
        tasks = json.loads(resp.text)
        results = []
        for t in tasks:
            safe_key = re.sub(r"[^a-zA-Z0-9_\-]", "_", t.get("asset_key", word).lower())
            tier = t.get("tier", usages_list[0]["tier"])
            scene_desc = t.get("scene_description", f"A tight close-up illustration of '{word}'.")
            full_prompt = (
                f"{UNIFIED_STYLE_ANCHOR} "
                f"Pedagogical style ({STAGE_PEDAGOGY_RULES.get(tier, STAGE_PEDAGOGY_RULES['tier1_starter'])['name']}): "
                f"{STAGE_PEDAGOGY_RULES.get(tier, STAGE_PEDAGOGY_RULES['tier1_starter'])['rule']} "
                f"Scene: {scene_desc}"
            )
            results.append(
                {
                    "word": word,
                    "asset_key": safe_key,
                    "tier": tier,
                    "meaning": t.get("meaning", usages_list[0].get("meaning", "")),
                    "image_prompt": full_prompt,
                }
            )
        if results:
            return results
    except Exception as e:
        print(f"  [提示词规划回退] {word}: {e}")

    first = usages_list[0]
    tier = first["tier"]
    safe_key = re.sub(r"[^a-zA-Z0-9_\-]", "_", word.lower())
    return [
        {
            "word": word,
            "asset_key": safe_key,
            "tier": tier,
            "meaning": first.get("meaning", ""),
            "image_prompt": (
                f"{UNIFIED_STYLE_ANCHOR} "
                f"{STAGE_PEDAGOGY_RULES[tier]['rule']} "
                f"Subject: tight close-up clearly illustrating the English word '{word}' ({first.get('meaning', '')})."
            ),
        }
    ]


# ============================================================================
# 4. 调用 Vertex AI Imagen 3 生成图片并压缩保存为 WebP / PNG
# ============================================================================

def generate_and_save_image(
    client: genai.Client,
    prompt: str,
    out_file: Path,
    imagen_model: str = "imagen-3.0-fast-generate-001",
    size: int = 512,
) -> bool:
    """调用 Vertex AI Imagen 3 生成 1:1 插画并保存为轻量级 WebP/PNG。"""
    response = client.models.generate_images(
        model=imagen_model,
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio="1:1",
            safety_filter_level="BLOCK_ONLY_HIGH",
            person_generation="ALLOW_ALL",
        ),
    )
    if not response.generated_images:
        return False

    img_bytes = response.generated_images[0].image.image_bytes
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    if size and (img.width != size or img.height != size):
        img = img.resize((size, size), Image.Resampling.LANCZOS)

    out_file.parent.mkdir(parents=True, exist_ok=True)
    if out_file.suffix.lower() == ".webp":
        img.save(out_file, format="WEBP", quality=85, method=6)
    else:
        img.save(out_file, format="PNG", optimize=True)
    return True


# ============================================================================
# 5. 主流程入口
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Word Guard 分级递进式 AI 配图批量生成工具 (Vertex AI)"
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="仅扫描并打印仓库词库与配图现状报告，不调用生图 API",
    )
    parser.add_argument(
        "--project",
        type=str,
        default=os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
        help="Google Cloud 项目 ID（在 Cloud Shell 中会自动读取当前项目）",
    )
    parser.add_argument(
        "--location",
        type=str,
        default="us-central1",
        help="Vertex AI 区域，默认 us-central1",
    )
    parser.add_argument(
        "--phase",
        choices=["phase1", "all"],
        default="phase1",
        help="phase1: 优先覆盖 Starters 和一二年级课本（约 600 张）；all: 覆盖全部 3112+ 词条",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="限制本次最多生成的图片张数（如 --limit 5 用于快速试跑验证），0 表示不限制",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="是否覆盖 art/index.json 中已存在的配图（默认增量补齐，若想统一替换旧图标请加此参数）",
    )
    parser.add_argument(
        "--format",
        choices=["webp", "png"],
        default="webp",
        help="输出图片格式，默认 webp（体积小、加载快）",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=512,
        help="输出正方形图片像素尺寸，默认 512x512",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="imagen-3.0-fast-generate-001",
        help="Imagen 模型名称：imagen-3.0-fast-generate-001 ($0.02/张) 或 imagen-3.0-generate-002 ($0.04/张)",
    )
    parser.add_argument(
        "--git-push",
        action="store_true",
        help="生成完成后自动 git add / commit / push 到 GitHub 仓库",
    )
    args = parser.parse_args()

    repo_root = Path.cwd()
    if args.inspect:
        inspect_repository(repo_root)
        return

    project_id = args.project
    if not project_id:
        try:
            project_id = subprocess.check_output(
                ["gcloud", "config", "get-value", "project"], text=True
            ).strip()
        except Exception:
            pass
    if not project_id:
        print("错误：未检测到 Google Cloud Project ID。请通过 --project YOUR_PROJECT_ID 指定。")
        sys.exit(1)

    print(f"=== Word Guard AI 插画生成启动 ===")
    print(f"GCP Project : {project_id} ({args.location})")
    print(f"生成范围    : {args.phase} | 覆盖已有图: {args.overwrite} | 数量上限: {args.limit or '无限制'}")
    print(f"生图模型    : {args.model} | 输出规格: {args.size}x{args.size} .{args.format}")

    client = genai.Client(vertexai=True, project=project_id, location=args.location)

    html_path = repo_root / "index.html"
    art_dir = repo_root / "art"
    index_json_path = art_dir / "index.json"
    plan_cache_path = art_dir / "visual_plan_cache.json"

    all_entries = extract_words_from_index_html(html_path)
    if args.phase == "phase1":
        target_entries = [e for e in all_entries if is_phase1_target(e["source"])]
        if not target_entries:
            print("[提示] 未通过分类字段筛选出子集，默认回退至前 600 条核心词。")
            target_entries = all_entries[:600]
    else:
        target_entries = all_entries

    grouped_words: Dict[str, List[Dict]] = {}
    for entry in target_entries:
        w = entry["word"].strip()
        if w:
            grouped_words.setdefault(w, []).append(entry)

    print(f"[统计] 当前阶段涉及独立单词 {len(grouped_words)} 个（共 {len(target_entries)} 次课本/级别出现）。")

    art_index = load_art_index(index_json_path)
    plan_cache = {}
    if plan_cache_path.exists():
        try:
            plan_cache = json.loads(plan_cache_path.read_text(encoding="utf-8"))
        except Exception:
            plan_cache = {}

    generated_count = 0
    skipped_count = 0

    for idx, (word, occurrences) in enumerate(grouped_words.items(), start=1):
        if args.limit and generated_count >= args.limit:
            print(f"\n[达到试跑上限] 已完成 {generated_count} 张图片生成。")
            break

        if word in plan_cache:
            tasks = plan_cache[word]
        else:
            tasks = plan_visual_tasks_for_word(client, word, occurrences)
            plan_cache[word] = tasks
            plan_cache_path.parent.mkdir(parents=True, exist_ok=True)
            plan_cache_path.write_text(
                json.dumps(plan_cache, ensure_ascii=False, indent=2), encoding="utf-8"
            )

        for t in tasks:
            if args.limit and generated_count >= args.limit:
                break

            asset_key = t["asset_key"]
            rel_filename = f"{asset_key}.{args.format}"
            out_file = art_dir / rel_filename

            if not args.overwrite and asset_key in art_index and out_file.exists():
                skipped_count += 1
                continue

            print(
                f"[{idx}/{len(grouped_words)}] 正在生成: {word} -> art/{rel_filename} "
                f"({t['tier']} | {t.get('meaning', '')})"
            )
            try:
                ok = generate_and_save_image(
                    client=client,
                    prompt=t["image_prompt"],
                    out_file=out_file,
                    imagen_model=args.model,
                    size=args.size,
                )
                if ok:
                    art_index[asset_key] = rel_filename
                    if word.lower() not in art_index:
                        art_index[word.lower()] = rel_filename
                    save_art_index(index_json_path, art_index)
                    generated_count += 1
                    time.sleep(1.2)
            except Exception as e:
                print(f"  [错误] 生成 {asset_key} 失败: {e}")
                time.sleep(3.0)

    print(
        f"\n=== 生成完成！新增/更新: {generated_count} 张，跳过已有: {skipped_count} 张 ==="
    )

    if args.git_push and generated_count > 0:
        print("正在提交并推送至 GitHub 仓库...")
        subprocess.check_call(["git", "add", "art/"])
        subprocess.check_call(
            [
                "git",
                "commit",
                "-m",
                f"feat(art): add {generated_count} unified progressive AI illustrations ({args.phase})",
            ]
        )
        subprocess.check_call(["git", "push"])
        print("已成功推送到 GitHub！")


if __name__ == "__main__":
    main()