"""Resolve model-selected line references against the untouched document text."""


def source_lines(text):
    return [{'id': i + 1, 'text': line} for i, line in enumerate(text.splitlines())]


def resolve_analysis(result, source):
    lines = source.splitlines(keepends=True)
    entries = result.get('experiences')
    if not isinstance(entries, list):
        raise ValueError('AI analysis returned no experience list. Your original text is preserved.')
    accepted, review = [], []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            review.append({'index': index, 'reason': 'Invalid entry format', 'entry': entry})
            continue
        item = dict(entry)
        ids = item.get('sourceLineIds')
        quote = item.get('sourceQuote')
        # The server, not the model, copies the authoritative source passage.
        if isinstance(ids, list) and ids and all(type(n) is int and 1 <= n <= len(lines) for n in ids):
            quote = ''.join(lines[min(ids)-1:max(ids)]).rstrip('\r\n')
        elif not (isinstance(quote, str) and quote.strip() and quote in source):
            review.append({'index': index, 'reason': 'Source line references were missing or invalid', 'entry': entry})
            continue
        if not isinstance(item.get('description'), str) or not item['description'].strip():
            review.append({'index': index, 'reason': 'Description is missing', 'entry': entry})
            continue
        item['sourceQuote'] = quote
        item['title'] = item.get('title') or item.get('organization') or 'Imported experience'
        item['confirmed'] = False
        accepted.append(item)
    return {'experiences': accepted, 'questions': result.get('questions', []),
            'reviewEntries': review, 'rawAnalysis': result,
            'warnings': ['%d entries need a source review and were not added automatically.' % len(review)] if review else []}
