"""Read public company postings; never send candidate information to a job board."""
import datetime
import html
import json
import re
import urllib.request
import urllib.parse

def search(board, query=''):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', board):
        raise ValueError('Use a valid Greenhouse board token.')
    url = 'https://boards-api.greenhouse.io/v1/boards/' + urllib.parse.quote(board) + '/jobs?content=true'
    with urllib.request.urlopen(url, timeout=20) as response:
        data = json.load(response)
    results = []
    for job in data.get('jobs', []):
        title = job.get('title', '')
        location = job.get('location', {}).get('name', 'Not specified')
        if query.lower() not in (title + ' ' + location).lower():
            continue
        results.append({'id': str(job['id']), 'title': title, 'company': board, 'location': location,
            'description': html.unescape(re.sub('<[^>]+>', ' ', job.get('content', ''))),
            'url': job['absolute_url'], 'source': 'Greenhouse', 'status': 'Open at last check',
            'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'updatedAt': job.get('updated_at'), 'deadline': None, 'demo': False})
    return results
