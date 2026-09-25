#!/usr/bin/env python3
"""Build version-pinned, offline Unicode data from official upstream archives."""
import argparse
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

VERSION = "18.0.0"
IVD_VERSION = "2026-08-03"
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "var" / "unicode" / VERSION
OUTPUT = ROOT / "public" / "data"
LOCK = ROOT / "tools" / "unicode-sources.json"
SOURCES = {
    "UCD.zip": f"https://www.unicode.org/Public/{VERSION}/ucd/UCD.zip",
    "Unihan.zip": f"https://www.unicode.org/Public/{VERSION}/ucd/Unihan.zip",
    "emoji-test.txt": f"https://www.unicode.org/Public/{VERSION}/emoji/emoji-test.txt",
    "IVD_Sequences.txt": f"https://www.unicode.org/ivd/data/{IVD_VERSION}/IVD_Sequences.txt",
    "license.txt": "https://www.unicode.org/license.txt",
}


def fields(text):
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            yield [part.strip() for part in line.split(";")]


def interval(raw):
    parts = raw.split("..")
    return [int(parts[0], 16), int(parts[-1], 16)]


def build(update_lock=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    old = json.loads(LOCK.read_text()) if LOCK.exists() else {}
    if old and not update_lock and old.get("version") != VERSION:
        raise ValueError("Source version mismatch; review before --update-lock")
    sources, blobs = {}, {}
    for name, url in SOURCES.items():
        path = CACHE / name
        if not path.exists():
            print(f"Downloading {url}", flush=True)
            with urllib.request.urlopen(url, timeout=90) as response:
                content = response.read()
            path.write_bytes(content)
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if old and not update_lock and old["sources"].get(name, {}).get("sha256") != digest:
            raise ValueError(f"Source checksum mismatch: {name}; review before --update-lock")
        sources[name] = {"url": url, "sha256": digest, "bytes": len(content)}
        blobs[name] = content

    ucd = zipfile.ZipFile(io.BytesIO(blobs["UCD.zip"]))

    def read(name):
        return ucd.read(name).decode("utf-8-sig")

    if f"final data files for version {VERSION}" not in read("ReadMe.txt"):
        raise ValueError("UCD archive is not the requested final Unicode version")
    emoji_header = re.search(r"^# Version: ([\d.]+)$", blobs["emoji-test.txt"].decode("utf-8"), re.MULTILINE)
    emoji_version = ".".join(VERSION.split(".")[:2])
    if not emoji_header or emoji_header[1] != emoji_version:
        raise ValueError("Emoji data version does not match the requested Unicode version")

    ivd_text = blobs["IVD_Sequences.txt"].decode("utf-8-sig")
    ivd_header = re.search(r"^# (\d{4}-\d{2}-\d{2})\b", ivd_text, re.MULTILINE)
    if not ivd_header or ivd_header[1] != IVD_VERSION:
        raise ValueError("IVD source is not the requested version; refresh its cache before updating the lock")

    records, first = [], None
    for row in fields(read("UnicodeData.txt")):
        cp, name = int(row[0], 16), row[1]
        if name.endswith(", First>"):
            first = cp
            continue
        start = first if name.endswith(", Last>") else cp
        records.append([start, cp, *row[2:]])
        first = None
    names = [[*interval(row[0]), row[1]] for row in fields(read("extracted/DerivedName.txt"))]
    aliases = defaultdict(list)
    for row in fields(read("NameAliases.txt")):
        aliases[row[0]].append(row[1:])
    props, defaults = {}, {}

    def property_file(filename, prop=None):
        text = read(filename)
        for row in fields(text):
            key = prop or row[1]
            value = "; ".join(row[1:] if prop else row[2:]) or "Yes"
            props.setdefault(key, []).append([*interval(row[0]), value])
        for match in re.finditer(r"#\s*@missing:\s*(.+)", text):
            row = [p.strip() for p in match[1].split(";")]
            key = prop or row[1]
            value = "; ".join(row[1:] if prop else row[2:]) or "No"
            defaults.setdefault(key, []).append([*interval(row[0]), value])

    for filename, prop in [
        ("Blocks.txt", "Block"), ("Scripts.txt", "Script"), ("ScriptExtensions.txt", "Script_Extensions"),
        ("DerivedAge.txt", "Age"), ("LineBreak.txt", "Line_Break"),
        ("EastAsianWidth.txt", "East_Asian_Width"), ("HangulSyllableType.txt", "Hangul_Syllable_Type"),
        ("auxiliary/GraphemeBreakProperty.txt", "Grapheme_Cluster_Break"),
        ("auxiliary/WordBreakProperty.txt", "Word_Break"),
        ("auxiliary/SentenceBreakProperty.txt", "Sentence_Break"),
        ("extracted/DerivedBidiClass.txt", "Bidi_Class"),
        ("extracted/DerivedJoiningType.txt", "Joining_Type"),
        ("extracted/DerivedJoiningGroup.txt", "Joining_Group"),
        ("PropList.txt", None), ("DerivedCoreProperties.txt", None),
        ("DerivedNormalizationProps.txt", None), ("emoji/emoji-data.txt", None),
    ]:
        property_file(filename, prop)
    for ranges in props.values():
        ranges.sort(key=lambda row: row[0])
    labels = defaultdict(dict)
    for row in fields(read("PropertyValueAliases.txt")):
        labels[row[0]][row[1]] = row[2]

    variations = defaultdict(list)
    for name in ["StandardizedVariants.txt", "emoji/emoji-variation-sequences.txt"]:
        for row in fields(read(name)):
            sequence = [int(cp, 16) for cp in row[0].split()]
            variations[f"{sequence[0]:04X}"].append([sequence, row[1]])
    notes = defaultdict(list)
    current = None
    for line in read("NamesList.txt").splitlines():
        match = re.match(r"^([0-9A-F]{4,6})\t", line)
        if match:
            current = match[1]
        elif current and line.startswith(("\t=", "\t*", "\tx", "\t%")):
            notes[current].append(line.strip())

    radical_forms = defaultdict(list)
    for row in fields(read("CJKRadicals.txt")):
        number = row[0].rstrip("'")
        radical_forms[number].append(row[0][len(number):])

    unihan = defaultdict(dict)
    archive = zipfile.ZipFile(io.BytesIO(blobs["Unihan.zip"]))
    for name in sorted(archive.namelist()):
        if not name.endswith(".txt"):
            continue
        text = archive.read(name).decode("utf-8")
        if not re.search(rf"^# Unicode Version {re.escape(VERSION)}$", text, re.MULTILINE):
            raise ValueError(f"Unihan data version mismatch: {name}")
        for line in text.splitlines():
            if line.startswith("U+"):
                cp, prop, value = line.split("\t", 2)
                unihan[cp[2:]][prop] = value
    search_fields = ["kRSUnicode", "kTotalStrokes", "kMandarin", "kCantonese", "kZhuang", "kDefinition", "kAlternateTotalStrokes"]
    reading_fields = json.loads((ROOT / "src/core/unihanReadings.json").read_text(encoding="utf-8"))
    search_fields.extend(key for key in reading_fields if key not in search_fields)
    search_properties = json.loads((ROOT / "src/core/propertySearch.json").read_text(encoding="utf-8"))
    search_fields.extend(dict.fromkeys(item["property"] for item in search_properties.values()
                                      if item["source"] == "unihan" and item["property"] not in search_fields))
    total_strokes = set()
    for values in unihan.values():
        total_strokes.update(int(value) for value in values.get("kTotalStrokes", "").split())
        total_strokes.update(int(value.split(":")[0]) for value in values.get("kAlternateTotalStrokes", "").split() if value != "-")
    han_index = [[int(cp, 16), *[values.get(key, "") for key in search_fields]] for cp, values in unihan.items()]
    han_index.sort(key=lambda row: row[0])
    shards = defaultdict(dict)
    for cp, values in unihan.items():
        shards[f"{int(cp, 16) >> 12:03x}"][cp] = values
    # UAX #60 uses Unihan's tagged tab-separated format, not UCD semicolons.
    # Preserve the complete values, including multiple source references.
    east_asian = defaultdict(dict)
    for name in ["TangutSources.txt", "NushuSources.txt", "JurchenSources.txt", "SealSources.txt"]:
        text = read(name)
        if not text.startswith(f"# {name[:-4]}-{VERSION}.txt"):
            raise ValueError(f"East Asian data version mismatch: {name}")
        for line in text.splitlines():
            if line.startswith("U+"):
                cp, prop, value = line.split("\t", 2)
                east_asian[cp[2:]][prop] = value
    east_fields = sorted({prop for values in east_asian.values() for prop in values})
    for item in search_properties.values():
        source = unihan if item["source"] == "unihan" else east_asian
        if not any(item["property"] in values for values in source.values()):
            raise ValueError(f"Search property has no source data: {item['property']}")
    east_index = [[int(cp, 16), *[values.get(key, "") for key in east_fields]] for cp, values in east_asian.items()]
    east_index.sort(key=lambda row: row[0])
    east_shards = defaultdict(dict)
    for cp, values in east_asian.items():
        east_shards[f"{int(cp, 16) >> 12:03x}"][cp] = values
    emoji, group, subgroup = [], "", ""
    for line in blobs["emoji-test.txt"].decode("utf-8").splitlines():
        if line.startswith("# group: "):
            group = line[9:]
        elif line.startswith("# subgroup: "):
            subgroup = line[12:]
        elif "; fully-qualified" in line:
            codes, rest = line.split(";", 1)
            description = re.search(r"#\s+\S+\s+E([\d.]+)\s+(.+)$", rest)
            emoji.append({"cps": [int(c, 16) for c in codes.split()], "name": description[2],
                          "version": description[1], "group": group, "subgroup": subgroup})

    core = {"version": VERSION, "emojiVersion": emoji_version, "records": records, "names": names, "aliases": dict(aliases),
            "properties": props, "defaults": defaults, "labels": dict(labels), "notes": dict(notes), "radicalForms": dict(radical_forms), "hanTotalStrokes": [str(value) for value in sorted(total_strokes)]}
    OUTPUT.mkdir(parents=True, exist_ok=True)

    def write(name, value):
        target = OUTPUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    write("unicode.json", core)
    write("han-index.json", {"fields": search_fields, "rows": han_index})
    write("east-asian-index.json", {"fields": east_fields, "rows": east_index})
    write("emoji.json", emoji)
    write("variations.json", dict(variations))
    # Keep standardized sequences separate from emoji presentation sequences.
    svs = sorted({tuple(int(cp, 16) for cp in row[0].split())
                  for row in fields(read("StandardizedVariants.txt"))})
    ivs = sorted({tuple(int(cp, 16) for cp in row[0].split()) for row in fields(ivd_text)})
    write("font-variation-sequences.json", {"svs": svs, "ivs": ivs, "ivdVersion": IVD_VERSION})
    for shard, values in sorted(shards.items()):
        write(f"unihan/{shard}.json", values)
    for shard, values in sorted(east_shards.items()):
        write(f"east-asian/{shard}.json", values)
    (OUTPUT / "LICENSE-UNICODE.txt").write_bytes(blobs["license.txt"])
    manifest = {"unicodeVersion": VERSION, "ivdVersion": IVD_VERSION, "emojiVersion": emoji_version, "sources": sources, "counts": {
        "records": len(records), "nameRanges": len(names), "blocks": len(props["Block"]),
        "unihanCharacters": len(unihan), "eastAsianCharacters": len(east_asian),
        "eastAsianProperties": len(east_fields), "emojiSequences": len(emoji)},
        "unihanShards": sorted(shards), "eastAsianShards": sorted(east_shards)}
    write("manifest.json", manifest)
    LOCK.write_text(json.dumps({"version": VERSION, "sources": sources}, indent=2) + "\n")
    print(json.dumps(manifest["counts"], indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update-lock", action="store_true")
    build(parser.parse_args().update_lock)
