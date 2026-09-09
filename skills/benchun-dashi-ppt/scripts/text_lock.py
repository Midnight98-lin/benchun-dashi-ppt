#!/usr/bin/env python3
"""Extract and verify locked PPTX wording using Python's standard library.

Usage:
  python text_lock.py extract source.pptx locked-text.json
  python text_lock.py verify locked-text.json output.pptx --report text-report.json

Whitespace and paragraph/page boundaries may change; spelling, punctuation,
case, numbers and the number of occurrences remain locked. A successful result
proves textual coverage, not visibility, hierarchy, reading order or image text.
"""

import argparse
from collections import Counter
import difflib
import hashlib
import json
from pathlib import Path
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
SCHEMA = "benchun-pptx-text-lock/v1"
LIMITATIONS = [
    "仅核对幻灯片 XML 中的可编辑文字；图片内文字、图表独立 XML、SmartArt、母版继承文字和视频画面不在覆盖范围。",
    "通过不代表文字可见、层级/顺序正确；隐藏、遮挡、裁切、同色字须逐页渲染检查。",
    "文本内容一对一匹配，允许换页、拆段、合段和内容组换位置；不判断表达逻辑。",
    "复杂重叠原文采用最长段落优先匹配，歧义可能保守报失败；不得据此直接改写原文。",
    "只有真实自动页码字段/页码占位符自动豁免；手写页码和目录页码默认锁定，变更须另行人工核验。",
]


def normalize(text):
    """Ignore Unicode whitespace only. Do not fold case or punctuation."""
    return "".join(text.split())


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def paragraph_text(paragraph):
    parts = []
    for node in paragraph.iter():
        if node.tag == "{" + NS["a"] + "}t":
            parts.append(node.text or "")
        elif node.tag == "{" + NS["a"] + "}br":
            parts.append("\n")
        elif node.tag == "{" + NS["a"] + "}tab":
            parts.append("\t")
    return "".join(parts)


def slide_parts(archive):
    presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
    relationships = ET.fromstring(archive.read("ppt/_rels/presentation.xml.rels"))
    targets = {}
    for rel in relationships:
        if rel.get("TargetMode") == "External":
            continue
        target = rel.get("Target", "")
        part = target.lstrip("/") if target.startswith("/") else posixpath.normpath("ppt/" + target)
        if part.startswith("../"):
            raise ValueError("PPTX contains an invalid relationship target")
        targets[rel.get("Id")] = part
    for index, item in enumerate(presentation.findall("p:sldIdLst/p:sldId", NS), 1):
        rel_id = item.get("{" + NS["r"] + "}id")
        if rel_id not in targets:
            raise ValueError("Missing slide relationship: " + str(rel_id))
        yield index, targets[rel_id]


def extract_deck(pptx_path):
    source = Path(pptx_path).resolve()
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    paragraphs = []
    slide_count = 0
    with zipfile.ZipFile(source) as archive:
        for slide_number, part in slide_parts(archive):
            slide_count += 1
            slide = ET.fromstring(archive.read(part))
            parents = {child: parent for parent in slide.iter() for child in parent}
            shape_counters = Counter()
            page_paragraph = 0
            for paragraph in slide.findall(".//a:p", NS):
                text = paragraph_text(paragraph)
                if not normalize(text):
                    continue
                page_paragraph += 1
                ancestor = parents.get(paragraph)
                shape = None
                cell = None
                while ancestor is not None:
                    if ancestor.tag == "{" + NS["a"] + "}tc" and cell is None:
                        cell = ancestor
                    if local_name(ancestor.tag) in ("sp", "graphicFrame", "cxnSp", "pic"):
                        shape = ancestor
                        break
                    ancestor = parents.get(ancestor)
                metadata = shape.find(".//p:cNvPr", NS) if shape is not None else None
                shape_id = metadata.get("id", "unknown") if metadata is not None else "unknown"
                shape_name = metadata.get("name", "") if metadata is not None else ""
                shape_counters[shape_id] += 1
                groups = []
                ancestor = parents.get(shape) if shape is not None else None
                while ancestor is not None:
                    if local_name(ancestor.tag) == "grpSp":
                        group_meta = ancestor.find("p:nvGrpSpPr/p:cNvPr", NS)
                        if group_meta is not None:
                            groups.append(group_meta.get("id", "unknown"))
                    ancestor = parents.get(ancestor)
                placeholders = shape.findall(".//p:ph", NS) if shape is not None else []
                auto_page = any(ph.get("type") == "sldNum" for ph in placeholders)
                text_nodes = paragraph.findall(".//a:t", NS)
                field_nodes = paragraph.findall(".//a:fld", NS)
                page_nodes = {node for field in field_nodes if field.get("type", "").lower() == "slidenum" for node in field.findall(".//a:t", NS)}
                if text_nodes and all(node in page_nodes for node in text_nodes):
                    auto_page = True
                table_cell = None
                if cell is not None:
                    row = parents[cell]
                    table = parents[row]
                    table_cell = {
                        "row": list(table.findall("a:tr", NS)).index(row) + 1,
                        "column": list(row.findall("a:tc", NS)).index(cell) + 1,
                    }
                paragraphs.append({
                    "id": f"slide-{slide_number:03d}/shape-{shape_id}/paragraph-{shape_counters[shape_id]:03d}",
                    "slide": slide_number,
                    "slide_part": part,
                    "slide_hidden": slide.get("show") == "0",
                    "shape_id": shape_id,
                    "shape_name": shape_name,
                    "group_path": list(reversed(groups)),
                    "paragraph_id": shape_counters[shape_id],
                    "slide_paragraph": page_paragraph,
                    "table_cell": table_cell,
                    "automatic_page_number": auto_page,
                    "text": text,
                    "normalized": normalize(text),
                })
    return {
        "schema": SCHEMA,
        "source": str(source),
        "source_sha256": digest,
        "slide_count": slide_count,
        "paragraph_count": len(paragraphs),
        "normalization": "Remove Unicode whitespace only; preserve punctuation, case and all other characters.",
        "limitations": LIMITATIONS,
        "paragraphs": paragraphs,
    }


def location(item):
    return {key: item.get(key) for key in ("id", "slide", "shape_id", "shape_name", "paragraph_id", "table_cell")}


def verify_deck(baseline, rendered):
    if baseline.get("schema") != SCHEMA:
        raise ValueError("Unsupported baseline schema")
    source = [p for p in baseline["paragraphs"] if not p.get("automatic_page_number")]
    target = [p for p in rendered["paragraphs"] if not p.get("automatic_page_number")]
    spans = []
    offset = 0
    for item in target:
        content = normalize(item["text"])
        spans.append((offset, offset + len(content), item))
        offset += len(content)
    stream = "".join(normalize(item["text"]) for item in target)
    consumed = bytearray(len(stream))
    matched = []
    missing = []
    # Consume every output character at most once. Longest-first stops short
    # labels from stealing the only occurrence of a longer locked paragraph.
    for item in sorted(source, key=lambda p: -len(normalize(p["text"]))):
        needle = normalize(item["text"])
        if not needle:
            continue
        start = stream.find(needle)
        while start >= 0 and any(consumed[start:start + len(needle)]):
            start = stream.find(needle, start + 1)
        if start < 0:
            missing.append(item)
            continue
        end = start + len(needle)
        consumed[start:end] = b"\x01" * len(needle)
        destinations = []
        for left, right, candidate in spans:
            if left < end and right > start:
                destinations.append({
                    **location(candidate),
                    "normalized_start": max(0, start - left),
                    "normalized_end": min(right, end) - left,
                })
        matched.append({"source": location(item), "target_segments": destinations})
    extra = []
    for left, right, item in spans:
        cursor = left
        fragments = []
        while cursor < right:
            if consumed[cursor]:
                cursor += 1
                continue
            end = cursor + 1
            while end < right and not consumed[end]:
                end += 1
            fragments.append({"normalized_start": cursor - left, "normalized_end": end - left, "text": stream[cursor:end]})
            cursor = end
        if fragments:
            extra.append({**location(item), "paragraph_text": item["text"], "unmatched_fragments": fragments})
    missing_report = []
    for item in missing:
        needle = normalize(item["text"])
        ranked = []
        for candidate in extra:
            residual = "".join(f["text"] for f in candidate["unmatched_fragments"])
            ratio = difflib.SequenceMatcher(None, needle, residual, autojunk=False).ratio()
            if ratio >= 0.25:
                ranked.append((ratio, candidate))
        ranked.sort(key=lambda pair: -pair[0])
        missing_report.append({
            **location(item),
            "text": item["text"],
            "possible_changed_locations": [
                {**location(candidate), "similarity": round(ratio, 3), "text": candidate["paragraph_text"]}
                for ratio, candidate in ranked[:3]
            ],
        })
    passed = not missing and not extra
    return {
        "schema": "benchun-pptx-text-verification/v1",
        "passed": passed,
        "status": "PASS_TEXT_ONLY" if passed else "FAIL_TEXT_DIFFERENCE",
        "baseline_source": baseline.get("source"),
        "baseline_source_sha256": baseline.get("source_sha256"),
        "rendered_source": rendered["source"],
        "rendered_sha256": rendered["source_sha256"],
        "source_slide_count": baseline["slide_count"],
        "target_slide_count": rendered["slide_count"],
        "source_locked_paragraphs": len(source),
        "matched_paragraphs": len(matched),
        "missing_or_changed_paragraphs": missing_report,
        "unexpected_output_text": extra,
        "matches": sorted(matched, key=lambda p: (p["source"]["slide"], p["source"]["id"])),
        "automatic_page_numbers_exempted": {
            "source": [location(p) for p in baseline["paragraphs"] if p.get("automatic_page_number")],
            "target": [location(p) for p in rendered["paragraphs"] if p.get("automatic_page_number")],
        },
        "limitations": LIMITATIONS,
    }


def write_json(path, data):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subcommands = parser.add_subparsers(dest="command", required=True)
    extract = subcommands.add_parser("extract", help="Extract a complete editable-text baseline")
    extract.add_argument("pptx")
    extract.add_argument("out_json")
    verify = subcommands.add_parser("verify", help="Check locked wording without reusing occurrences")
    verify.add_argument("baseline_json")
    verify.add_argument("rendered_pptx")
    verify.add_argument("--report", help="Also save the complete JSON report")
    args = parser.parse_args(argv)
    try:
        if args.command == "extract":
            if Path(args.pptx).resolve() == Path(args.out_json).resolve():
                raise ValueError("Output must not overwrite the source PPTX")
            baseline = extract_deck(args.pptx)
            write_json(args.out_json, baseline)
            print(json.dumps({"status": "EXTRACTED", "baseline": str(Path(args.out_json).resolve()), "slides": baseline["slide_count"], "paragraphs": baseline["paragraph_count"]}, ensure_ascii=False))
            return 0
        baseline = json.loads(Path(args.baseline_json).read_text(encoding="utf-8-sig"))
        report = verify_deck(baseline, extract_deck(args.rendered_pptx))
        if args.report:
            forbidden = {Path(args.baseline_json).resolve(), Path(args.rendered_pptx).resolve()}
            if Path(args.report).resolve() in forbidden:
                raise ValueError("Report must not overwrite the baseline or PPTX")
            write_json(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["passed"] else 1
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, ET.ParseError) as error:
        print(json.dumps({"status": "ERROR", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
