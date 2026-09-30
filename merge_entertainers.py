#!/usr/bin/env python3
"""Merge a text file of names into entertainers.txt, removing duplicates."""

import argparse
import os
from pathlib import Path
import re
import tempfile


def merge_entertainers(new_file, main_file):
    # Read both inputs before replacing the main file.
    existing = main_file.read_text(encoding="utf-8-sig") if main_file.exists() else ""
    incoming = new_file.read_text(encoding="utf-8-sig")
    names = []
    seen = set()
    duplicates = 0
    added = 0
    for is_new, contents in ((False, existing), (True, incoming)):
        for line in contents.splitlines():
            if is_new:
                # Strip pasted list numbers, including markers such as "1." or "2)".
                # Clean before deduplication so numbered copies match existing names.
                line = re.sub(r"^\s*\d+[.)]?\s*", "", line)
            # Commas and spaces both separate name parts in the extension.
            parts = line.replace(",", " ").split()
            key = " ".join(parts).casefold()
            if not key:
                continue
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
            names.append(", ".join(parts))
            added += int(is_new)

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n",
            dir=main_file.parent, prefix=".entertainers-", delete=False,
        ) as output:
            temporary = Path(output.name)
            output.write("\n".join(names) + ("\n" if names else ""))
        temporary.chmod(main_file.stat().st_mode & 0o777 if main_file.exists() else 0o644)
        os.replace(temporary, main_file)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return len(names), added, duplicates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("new_file", type=Path, help="Text file with one entertainer per line")
    parser.add_argument(
        "--main", type=Path,
        default=Path(__file__).resolve().with_name("entertainers.txt"),
        help="Main file to update (default: entertainers.txt next to this script)",
    )
    args = parser.parse_args()
    try:
        total, added, duplicates = merge_entertainers(args.new_file, args.main)
    except (OSError, UnicodeError) as error:
        parser.exit(1, f"Error: {error}\n")
    print(f"Saved {total} unique entertainers to {args.main}")
    print(f"Added {added} new names; removed {duplicates} duplicate entries.")


if __name__ == "__main__":
    main()
