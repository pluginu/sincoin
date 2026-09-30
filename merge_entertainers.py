#!/usr/bin/env python3
"""Merge entertainer names and social links, combining duplicate names."""

import argparse
import os
from pathlib import Path
import re
import tempfile
from entertainer_links import parse_line


def merge_entertainers(new_file, main_file):
    # Read both inputs before replacing the main file.
    existing = main_file.read_text(encoding="utf-8-sig") if main_file.exists() else ""
    incoming = new_file.read_text(encoding="utf-8-sig")
    records = {}
    duplicates = 0
    added = 0
    for is_new, contents in ((False, existing), (True, incoming)):
        for number, line in enumerate(contents.splitlines(), 1):
            if is_new:
                line = re.sub(r"^\s*\d+[.)]?\s+", "", line)
            try:
                name, links = parse_line(line)
            except ValueError as error:
                source = new_file if is_new else main_file
                raise ValueError(f"{source}:{number}: {error}") from error
            if not name:
                continue
            # Identity is the name, not the entire line: later entries can add links.
            key = name.casefold()
            if key in records:
                duplicates += 1
                records[key][1].extend(link for link in links if link not in records[key][1])
            else:
                records[key] = (name, links)
                added += int(is_new)
    names = [", ".join(name.split() + links) for name, links in records.values()]

    # Validate every record before atomically replacing the file in the same directory.
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
    except (OSError, UnicodeError, ValueError) as error:
        parser.exit(1, f"Error: {error}\n")
    print(f"Saved {total} unique entertainers to {args.main}")
    print(f"Added {added} new names; removed {duplicates} duplicate entries.")


if __name__ == "__main__":
    main()
