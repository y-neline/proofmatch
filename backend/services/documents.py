"""Extract text without claiming that imported statements are verified facts."""
import base64
import io

def extract(payload):
    raw = base64.b64decode(payload['content'], validate=True)
    name = payload['name'].lower()
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('Files must be smaller than 8 MB.')
    if name.endswith('.txt'):
        text = raw.decode('utf-8-sig')
    elif name.endswith('.pdf'):
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError('Install requirements.txt to read PDF files, or paste the text instead.')
        text = '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(raw)).pages)
    elif name.endswith('.docx'):
        try:
            from docx import Document
        except ImportError:
            raise ValueError('Install requirements.txt to read DOCX files, or paste the text instead.')
        doc = Document(io.BytesIO(raw))
        text = '\n'.join([p.text for p in doc.paragraphs] + [c.text for t in doc.tables for r in t.rows for c in r.cells])
    else:
        raise ValueError('Upload a text PDF, DOCX, or TXT file.')
    if not text.strip():
        raise ValueError('No readable text found. Scanned documents require OCR; paste the text instead.')
    if len(text) > 60000:
        raise ValueError('Document text exceeds 60,000 characters. Import a shorter document; no text was silently truncated.')
    return text
