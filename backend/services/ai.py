"""Provider-independent model adapter. Prompts are editable Markdown files."""
import json
import os
import urllib.request
from pathlib import Path
from backend.services.resume import source_lines, resolve_analysis

PROMPTS = Path(__file__).resolve().parents[1] / 'prompts'

def configured():
    return bool(os.environ.get('AI_API_KEY'))

def generate(task, payload):
    if task not in {'parse', 'rewrite', 'paths', 'analyze', 'train', 'feedback'}:
        raise ValueError('Unsupported AI task.')
    if task == 'parse':
        source = payload.get('sourceText', '')
        if not isinstance(source, str) or not source.strip():
            raise ValueError('Provide résumé text to analyze.')
        payload = {**payload, 'sourceLines': source_lines(source)}
    system = (PROMPTS / 'system.md').read_text() + '\n' + (PROMPTS / (task + '.md')).read_text()
    body = {'model': os.environ.get('AI_MODEL', 'gpt-4.1-mini'),
            'messages': [{'role': 'system', 'content': system},
                         {'role': 'user', 'content': json.dumps(payload)}],
            'response_format': {'type': 'json_object'}}
    request = urllib.request.Request(os.environ.get('AI_BASE_URL', 'https://api.openai.com/v1').rstrip('/') + '/chat/completions',
        data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + os.environ['AI_API_KEY'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    parsed = json.loads(result['choices'][0]['message']['content'])
    if not isinstance(parsed, dict):
        raise ValueError('The AI provider returned an invalid JSON object.')
    return resolve_analysis(parsed, source) if task == 'parse' else parsed
