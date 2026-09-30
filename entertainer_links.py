"""Shared line format: comma-separated name parts, URLs, or platform: @handle."""
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit, quote

PLATFORMS = json.loads(Path(__file__).with_name('social-platforms.json').read_text())
ALIASES = {alias: platform for platform in PLATFORMS for alias in platform['aliases']}
# Keep a labeled handle together even when a space follows the colon.
TOKEN = re.compile(r'[^\s,]+:\s+@?[^\s,]+|[^\s,]+')

def normalize_link(token):
    """Return a safe URL, None for a name part, or raise for invalid link input."""
    labeled = re.fullmatch(r'([\w-]+):\s*@?([^\s]+)', token)
    if labeled and labeled[1].lower() in ALIASES:
        platform = ALIASES[labeled[1].lower()]
        handle = labeled[2].lstrip('@')
        # Some services use IDs or multiple profile paths; do not guess those URLs.
        if not platform['profile']:
            raise ValueError(f'{platform["name"]}: use the full profile URL')
        if not re.fullmatch(r'[\w.-]+', handle):
            raise ValueError(f'Invalid handle: {token}')
        token = 'https://' + platform['domains'][0] + platform['profile'].replace('{handle}', quote(handle))
    elif token.startswith('@'):
        raise ValueError(f'Ambiguous handle {token}: add a platform, e.g. instagram: {token}')
    elif not re.match(r'https?://', token, re.I):
        if re.match(r'^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)', token, re.I):
            token = 'https://' + token
        elif ':' in token or '/' in token:
            raise ValueError(f'Invalid link or unknown platform: {token}')
        else:
            return None
    url = urlsplit(token)
    if url.scheme.lower() not in ('http', 'https') or not url.hostname or url.username or url.password or re.search(r'[\s<>\\]', token):
        raise ValueError(f'Invalid URL: {token}')
    host = url.hostname.lower()
    if host in ('twitter.com', 'www.twitter.com', 'www.x.com'):
        host = 'x.com'
    port = url.port
    return urlunsplit((url.scheme.lower(), host + (f':{port}' if port else ''), url.path or '/', url.query, url.fragment))

def parse_line(line):
    name, links = [], []
    for token in TOKEN.findall(line):
        link = normalize_link(token)
        if link:
            if link not in links:
                links.append(link)
        else:
            name.append(token)
    if links and not name:
        raise ValueError('A line with links must include an entertainer name')
    return ' '.join(name), links
