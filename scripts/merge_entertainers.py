#!/usr/bin/env python3
"""Merge entertainer names and social links, updating existing profile URLs.

Rules:
- The complete entertainer name stays one field (for example: "Angela White").
- New entertainers are added.
- Existing entertainers gain links for platforms/domains they are missing.
- If an incoming record has a different profile URL for a platform/domain already
  present on the existing record, the incoming URL replaces the old one.
- Duplicate/equivalent links are removed.
- A profile URL cannot belong to two different entertainers.

Output format:
Full Name, URL, URL, URL
"""

import argparse
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit

# Keep Python caches out of the unpacked Chrome extension.
sys.dont_write_bytecode = True

from entertainer_links import parse_line, link_key


def normalized_domain(url):
    """Return a normalized domain used to decide whether two links are the same platform.

    Twitter and X are intentionally treated as the same platform so a newer X/Twitter
    handle replaces the older one rather than creating two profile links.
    """
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        host = ""

    host = host.casefold().strip(".")
    if host.startswith("www."):
        host = host[4:]

    # Treat common mobile/subdomain variants as the same service.
    if host.startswith("m."):
        host = host[2:]

    aliases = {
        "twitter.com": "x.com",
        "mobile.twitter.com": "x.com",
        "mobile.x.com": "x.com",
    }
    return aliases.get(host, host)


def dedupe_links(links):
    """Keep one URL per normalized domain/platform, preferring the last occurrence."""
    by_domain = {}
    order = []

    for link in links:
        domain = normalized_domain(link)
        identity = link_key(link)

        # For unusual/non-URL values, fall back to the existing canonical link key.
        key = ("domain", domain) if domain else ("link", identity)

        if key not in by_domain:
            order.append(key)

        # Last occurrence wins. This lets later/incoming data update an old handle.
        by_domain[key] = link

    return [by_domain[key] for key in order]


def update_links(existing_links, incoming_links):
    """Merge links with incoming data taking priority for the same domain/platform."""
    merged = list(existing_links)

    for new_link in incoming_links:
        new_domain = normalized_domain(new_link)
        new_identity = link_key(new_link)

        replacement_index = None

        for index, old_link in enumerate(merged):
            old_domain = normalized_domain(old_link)

            # Same platform/domain means the incoming profile is authoritative.
            if new_domain and old_domain == new_domain:
                replacement_index = index
                break

            # Also catch equivalent canonical URLs.
            if link_key(old_link) == new_identity:
                replacement_index = index
                break

        if replacement_index is None:
            merged.append(new_link)
        else:
            merged[replacement_index] = new_link

    return dedupe_links(merged)


def rebuild_owners(records):
    """Build URL ownership map and reject URLs assigned to multiple entertainers."""
    owners = {}

    for key, record in records.items():
        name, links = record
        for link in links:
            identity = link_key(link)
            owner = owners.get(identity)

            if owner and owner[0] != key:
                raise ValueError(
                    f"URL {link} belongs to both {owner[1]} and {name}"
                )

            owners[identity] = (key, name)

    return owners


def merge_entertainers(new_file, main_file):
    # Read both inputs before replacing the main file.
    existing = main_file.read_text(encoding="utf-8-sig") if main_file.exists() else ""
    incoming = new_file.read_text(encoding="utf-8-sig")

    records = {}
    duplicates = 0
    added = 0
    updated = 0

    # Load the existing file first.
    for number, line in enumerate(existing.splitlines(), 1):
        try:
            name, links = parse_line(line)
        except ValueError as error:
            raise ValueError(f"{main_file}:{number}: {error}") from error

        if not name:
            continue

        key = name.casefold()
        links = dedupe_links(links)

        if key in records:
            duplicates += 1
            old_name, old_links = records[key]
            records[key] = [old_name, update_links(old_links, links)]
        else:
            records[key] = [name, links]

    # Validate the existing data before applying updates.
    rebuild_owners(records)

    # Incoming data is authoritative for any platform/domain it explicitly supplies.
    for number, line in enumerate(incoming.splitlines(), 1):
        line = re.sub(r"^\s*\d+[.)]?\s+", "", line)

        try:
            name, links = parse_line(line)
        except ValueError as error:
            raise ValueError(f"{new_file}:{number}: {error}") from error

        if not name:
            continue

        key = name.casefold()
        links = dedupe_links(links)

        if key in records:
            duplicates += 1
            old_name, old_links = records[key]
            merged_links = update_links(old_links, links)

            if merged_links != old_links:
                updated += 1

            records[key] = [old_name, merged_links]
        else:
            records[key] = [name, links]
            added += 1

        # Validate after each incoming record so errors identify the relevant line.
        try:
            rebuild_owners(records)
        except ValueError as error:
            raise ValueError(f"{new_file}:{number}: {error}") from error

    # Final cleanup and validation.
    for key, record in records.items():
        record[1] = dedupe_links(record[1])

    rebuild_owners(records)

    # Preserve the full entertainer name as ONE field.
    lines = [
        ", ".join([name] + links)
        for name, links in records.values()
    ]

    # Atomically replace the main file in the same directory.
    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=main_file.parent,
            prefix=".entertainers-",
            delete=False,
        ) as output:
            temporary = Path(output.name)
            output.write("\n".join(lines) + ("\n" if lines else ""))

        temporary.chmod(
            main_file.stat().st_mode & 0o777
            if main_file.exists()
            else 0o644
        )

        os.replace(temporary, main_file)

    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()

    return len(lines), added, updated, duplicates


def main():
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument(
        "new_file",
        type=Path,
        help="Text file with one entertainer per line",
    )

    parser.add_argument(
        "--main",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "entertainers.txt",
        help="Main file to update (default: entertainers.txt in the repository root)",
    )

    args = parser.parse_args()

    try:
        total, added, updated, duplicates = merge_entertainers(
            args.new_file,
            args.main,
        )
    except (OSError, UnicodeError, ValueError) as error:
        parser.exit(1, f"Error: {error}\n")

    print(f"Saved {total} unique entertainers to {args.main}")
    print(f"Added {added} new entertainers.")
    print(f"Updated {updated} existing entertainers with new/replacement links.")
    print(f"Merged {duplicates} duplicate-name entries.")


if __name__ == "__main__":
    main()
