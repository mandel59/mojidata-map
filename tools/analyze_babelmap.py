#!/usr/bin/env python3
"""Inventory PE resources without running or redistributing the reference binary."""
import argparse
import hashlib
import json
import re
import struct
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def analyze(archive):
    raw = Path(archive).read_bytes()
    with zipfile.ZipFile(archive) as zipped:
        binary = zipped.read("BabelMap.exe")
    pe = struct.unpack_from("<I", binary, 0x3C)[0]
    if binary[pe:pe + 4] != b"PE\0\0":
        raise ValueError("Not a PE executable")
    machine, count, timestamp = struct.unpack_from("<HHI", binary, pe + 4)
    optional_size = struct.unpack_from("<H", binary, pe + 20)[0]
    optional = pe + 24
    magic = struct.unpack_from("<H", binary, optional)[0]
    directories = optional + (96 if magic == 0x10B else 112)
    resource_rva = struct.unpack_from("<I", binary, directories + 16)[0]
    sections = []
    for index in range(count):
        offset = optional + optional_size + index * 40
        name = binary[offset:offset + 8].rstrip(b"\0").decode("ascii")
        size, rva, raw_size, raw_offset = struct.unpack_from("<IIII", binary, offset + 8)
        sections.append((name, rva, max(size, raw_size), raw_offset))

    def file_offset(rva):
        for _, start, size, offset in sections:
            if start <= rva < start + size:
                return offset + rva - start
        raise ValueError(f"Unmapped RVA: {rva:x}")

    base = file_offset(resource_rva)
    resources = []

    def walk(relative, path):
        offset = base + relative
        named, numbered = struct.unpack_from("<HH", binary, offset + 12)
        for index in range(named + numbered):
            name, target = struct.unpack_from("<II", binary, offset + 16 + index * 8)
            if name & 0x80000000:
                at = base + (name & 0x7FFFFFFF)
                length = struct.unpack_from("<H", binary, at)[0]
                name = binary[at + 2:at + 2 + length * 2].decode("utf-16le")
            child = [*path, name]
            if target & 0x80000000:
                walk(target & 0x7FFFFFFF, child)
            else:
                rva, length, codepage, _ = struct.unpack_from("<IIII", binary, base + target)
                data = binary[file_offset(rva):file_offset(rva) + length]
                item = {"path": child, "bytes": length, "codepage": codepage}
                # Resource text is documentation evidence, never application data.
                if child[0] in (4, 5, 16):
                    item["text"] = [m.decode("utf-16le") for m in
                                    re.findall(rb"(?:[\x20-\x7e]\x00){3,}", data)]
                if child[0] == 6:
                    strings, cursor = {}, 0
                    for slot in range(16):
                        length = struct.unpack_from("<H", data, cursor)[0]
                        cursor += 2
                        text = data[cursor:cursor + 2 * length].decode("utf-16le")
                        cursor += 2 * length
                        if text:
                            strings[str((child[1] - 1) * 16 + slot)] = text
                    item["strings"] = strings
                resources.append(item)

    walk(0, [])
    return {
        "archive": Path(archive).name,
        "archive_sha256": hashlib.sha256(raw).hexdigest(),
        "executable_sha256": hashlib.sha256(binary).hexdigest(),
        "executable_bytes": len(binary),
        "machine": hex(machine),
        "pe_timestamp_utc": datetime.fromtimestamp(timestamp, timezone.utc).isoformat(),
        "sections": [s[0] for s in sections],
        "resource_counts": dict(Counter(str(r["path"][0]) for r in resources)),
        "resources": resources,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?", default="var/BabelMapBeta.zip")
    parser.add_argument("--output", default="var/babelmap-resources.json")
    args = parser.parse_args()
    result = analyze(args.archive)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "resources"}, indent=2))
